exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { query, weight } = event.queryStringParameters;
  if (!query) return { statusCode: 400, body: JSON.stringify({ error: 'No query provided' }) };

  const portionWeight = parseFloat(weight) || 100;

  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Branded,SR%20Legacy,Survey%20(FNDDS)&pageSize=8&api_key=${process.env.USDA_API_KEY}`
  );
  const data = await res.json();

  if (!data.foods || data.foods.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  const results = data.foods.slice(0, 6).map(food => {
    let calories = 0, protein = 0, carbs = 0, fat = 0;

    (food.foodNutrients || []).forEach(n => {
      const name = (n.nutrientName || '').toLowerCase();
      const id = n.nutrientId;
      const val = parseFloat(n.value) || 0;

      // Match by nutrient ID (most reliable) or name
      if (id === 1008 || id === 2047 || id === 2048) calories = val;
      else if (id === 1003) protein = val;
      else if (id === 1005 || id === 1050) carbs = val;
      else if (id === 1004) fat = val;
      // Fallback name matching
      else if (!calories && name.includes('energy') && (n.unitName || '').toLowerCase() === 'kcal') calories = val;
      else if (!protein && name.includes('protein')) protein = val;
      else if (!carbs && name.includes('carbohydrate')) carbs = val;
      else if (!fat && (name.includes('total lipid') || name === 'fat, total')) fat = val;
    });

    const scale = portionWeight / 100;
    return {
      food: food.description,
      brand: food.brandOwner || food.brandName || null,
      calories: Math.round(calories * scale),
      protein_g: Math.round(protein * scale * 10) / 10,
      carbs_g: Math.round(carbs * scale * 10) / 10,
      fat_g: Math.round(fat * scale * 10) / 10,
    };
  }).filter(r => r.calories > 0); // hide results with no data

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results })
  };
};
