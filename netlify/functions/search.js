exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { query, weight } = event.queryStringParameters;
  if (!query) return { statusCode: 400, body: JSON.stringify({ error: 'No query provided' }) };

  const portionWeight = parseFloat(weight) || 100;

  const res = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=10&fields=product_name,brands,nutriments`,
    { headers: { 'User-Agent': 'MacroSnap/1.0 (nutrition tracker app)' } }
  );

  if (!res.ok) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Search service unavailable, try again' }) };
  }

  const data = await res.json();

  if (!data.hits || data.hits.length === 0) {
    return { statusCode: 200, body: JSON.stringify({ results: [] }) };
  }

  const toTitleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const seen = new Set();

  const results = data.hits
    .map(p => {
      const n = p.nutriments || {};
      const calories = parseFloat(n['energy-kcal_100g'] || 0);
      const protein = parseFloat(n['proteins_100g'] || 0);
      const carbs = parseFloat(n['carbohydrates_100g'] || 0);
      const fat = parseFloat(n['fat_100g'] || 0);

      if (!calories || !p.product_name) return null;

      const brand = p.brands ? toTitleCase(p.brands.split(',')[0].trim()) : null;
      const name = toTitleCase(p.product_name.trim());
      const brandInName = brand && name.toLowerCase().includes(brand.toLowerCase().split(' ')[0]);
      const displayName = (brand && !brandInName) ? `${brand} ${name}` : name;

      const key = displayName.toLowerCase();
      if (seen.has(key)) return null;
      seen.add(key);

      const scale = portionWeight / 100;
      return {
        food: displayName,
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
