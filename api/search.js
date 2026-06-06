export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query, weight } = req.query;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const portionWeight = parseFloat(weight) || 100;

  const response = await fetch(
    `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(query)}`,
    { headers: { 'X-Api-Key': process.env.CALORIENINJAS_API_KEY } }
  );

  if (!response.ok) return res.status(500).json({ error: 'Search service unavailable, try again' });

  const data = await response.json();
  if (!data || data.length === 0) return res.status(200).json({ results: [] });

  const toTitleCase = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // CalorieNinjas returns per-serving data based on the query
  // We need to scale to portionWeight
  const results = data.slice(0, 6).map(item => {
    const servingWeight = parseFloat(item.serving_size_g) || 100;
    const scale = portionWeight / servingWeight;
    return {
      food: toTitleCase(item.name),
      brand: null,
      calories: Math.round((item.calories || 0) * scale),
      protein_g: Math.round((item.protein_g || 0) * scale * 10) / 10,
      carbs_g: Math.round((item.carbohydrates_total_g || 0) * scale * 10) / 10,
      fat_g: Math.round((item.fat_total_g || 0) * scale * 10) / 10,
    };
  });

  res.status(200).json({ results });
}
