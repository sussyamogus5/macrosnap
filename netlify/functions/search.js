exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { query, weight } = event.queryStringParameters;
  if (!query) return { statusCode: 400, body: JSON.stringify({ error: 'No query provided' }) };

  const portionWeight = parseFloat(weight) || 100;

  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Branded,SR%20Legacy,Survey%20(FNDDS)&pageSize=6&api_key=${process.env.USDA_API_KEY}`
  );
  const data = await res.json();

  if (!data.foods || data.foods.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  const results = data.foods.slice(0, 6).map(food => {
    const nutrients = {};
    (food.foodNutrients || []).forEach(n => {
      if (n.nutrientName?.includes('Energy') && n.unitName === 'kcal') nutrients.calories = n.value;
      if (n.nutrientName?.includes('Protein')) nutrients.protein_g = n.value;
      if (n.nutrientName?.includes('Carbohydrate')) nutrients.carbs_g = n.value;
      if (n.nutrientName?.includes('Total lipid') || n.nutrientName?.includes('fat')) nutrients.fat_g = n.value;
    });

    // Scale from per-100g to portionWeight
    const scale = portionWeight / 100;
    return {
      fdcId: food.fdcId,
      food: food.description,
      brand: food.brandOwner || food.brandName || null,
      calories: Math.round((nutrients.calories || 0) * scale),
      protein_g: Math.round((nutrients.protein_g || 0) * scale * 10) / 10,
      carbs_g: Math.round((nutrients.carbs_g || 0) * scale * 10) / 10,
      fat_g: Math.round((nutrients.fat_g || 0) * scale * 10) / 10,
      per100g: {
        calories: Math.round(nutrients.calories || 0),
        protein_g: Math.round((nutrients.protein_g || 0) * 10) / 10,
        carbs_g: Math.round((nutrients.carbs_g || 0) * 10) / 10,
        fat_g: Math.round((nutrients.fat_g || 0) * 10) / 10,
      }
    };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results })
  };
};
