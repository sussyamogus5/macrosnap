export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query, weight } = req.query;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const portionWeight = parseFloat(weight) || 100;
  const toTitleCase = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // Step 1: Get OAuth token from FatSecret
  const tokenRes = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.FATSECRET_CLIENT_ID,
      client_secret: process.env.FATSECRET_CLIENT_SECRET,
      scope: 'basic'
    })
  });

  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) {
    return res.status(500).json({ error: 'FatSecret auth failed' });
  }

  // Step 2: Search for foods
  const searchRes = await fetch(
    `https://platform.fatsecret.com/rest/server.api?method=foods.search&search_expression=${encodeURIComponent(query)}&format=json&max_results=8`,
    { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
  );

  const searchData = await searchRes.json();
  const foods = searchData?.foods?.food;
  if (!foods) return res.status(200).json({ results: [] });

  const foodList = Array.isArray(foods) ? foods : [foods];

  const results = foodList
    .slice(0, 6)
    .map(food => {
      // FatSecret returns nutrition as a description string like "Per 100g - Calories: 66kcal | Fat: 0.44g | Carbs: 16.53g | Protein: 0.83g"
      const desc = food.food_description || '';
      const calMatch = desc.match(/Calories:\s*([\d.]+)/i);
      const fatMatch = desc.match(/Fat:\s*([\d.]+)/i);
      const carbMatch = desc.match(/Carbs:\s*([\d.]+)/i);
      const protMatch = desc.match(/Protein:\s*([\d.]+)/i);

      const cal100 = parseFloat(calMatch?.[1] || 0);
      const fat100 = parseFloat(fatMatch?.[1] || 0);
      const carb100 = parseFloat(carbMatch?.[1] || 0);
      const prot100 = parseFloat(protMatch?.[1] || 0);

      if (!cal100) return null;

      const scale = portionWeight / 100;
      return {
        food: toTitleCase(food.food_name),
        brand: food.brand_name ? toTitleCase(food.brand_name) : null,
        calories: Math.round(cal100 * scale),
        protein_g: Math.round(prot100 * scale * 10) / 10,
        carbs_g: Math.round(carb100 * scale * 10) / 10,
        fat_g: Math.round(fat100 * scale * 10) / 10,
      };
    })
    .filter(Boolean);

  res.status(200).json({ results });
}
