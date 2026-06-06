exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { query, weight } = event.queryStringParameters;
  if (!query) return { statusCode: 400, body: JSON.stringify({ error: 'No query provided' }) };

  const portionWeight = parseFloat(weight) || 100;

  // Search branded foods first, then fall back to SR Legacy
  const [brandedRes, genericRes] = await Promise.all([
    fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=Branded&pageSize=6&sortBy=score&api_key=${process.env.USDA_API_KEY}`),
    fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=SR%20Legacy,Survey%20(FNDDS)&pageSize=3&api_key=${process.env.USDA_API_KEY}`)
  ]);

  const [brandedData, genericData] = await Promise.all([brandedRes.json(), genericRes.json()]);

  const allFoods = [
    ...(brandedData.foods || []),
    ...(genericData.foods || [])
  ];

  if (allFoods.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  const parseNutrients = (foodNutrients) => {
    let calories = 0, protein = 0, carbs = 0, fat = 0;
    (foodNutrients || []).forEach(n => {
      const id = n.nutrientId;
      const val = parseFloat(n.value) || 0;
      const name = (n.nutrientName || '').toLowerCase();
      if (id === 1008 || id === 2047 || id === 2048) calories = val;
      else if (id === 1003) protein = val;
      else if (id === 1005 || id === 1050) carbs = val;
      else if (id === 1004) fat = val;
      else if (!calories && name.includes('energy') && (n.unitName || '').toLowerCase() === 'kcal') calories = val;
      else if (!protein && name.includes('protein')) protein = val;
      else if (!carbs && name.includes('carbohydrate')) carbs = val;
      else if (!fat && name.includes('total lipid')) fat = val;
    });
    return { calories, protein, carbs, fat };
  };

  // Deduplicate by name+brand combo
  const seen = new Set();
  const results = allFoods
    .map(food => {
      const { calories, protein, carbs, fat } = parseNutrients(food.foodNutrients);
      if (!calories) return null;

      const brand = food.brandName || food.brandOwner || null;
      const name = food.description
        .split(',')[0]  // trim overly long USDA descriptions
        .replace(/\b\w/g, c => c.toUpperCase()); // Title case

      const key = `${name}__${brand}`.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);

      const scale = portionWeight / 100;
      return {
        food: name,
        brand,
        calories: Math.round(calories * scale),
        protein_g: Math.round(protein * scale * 10) / 10,
        carbs_g: Math.round(carbs * scale * 10) / 10,
        fat_g: Math.round(fat * scale * 10) / 10,
      };
    })
    .filter(Boolean)
    .slice(0, 6);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results })
  };
};
