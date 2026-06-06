export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query, weight } = req.query;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const portionWeight = parseFloat(weight) || 100;
  const toTitleCase = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // Try CalorieNinjas first
  let results = [];
  try {
    const cnRes = await fetch(
      `https://api.api-ninjas.com/v1/nutrition?query=${encodeURIComponent(`${portionWeight}g ${query}`)}`,
      { headers: { 'X-Api-Key': process.env.CALORIENINJAS_API_KEY } }
    );
    const cnData = await cnRes.json();
    if (cnData && cnData.length > 0) {
      results = cnData
        .filter(item => item.calories > 0)
        .slice(0, 6)
        .map(item => ({
          food: toTitleCase(item.name),
          brand: null,
          calories: Math.round(item.calories || 0),
          protein_g: Math.round((item.protein_g || 0) * 10) / 10,
          carbs_g: Math.round((item.carbohydrates_total_g || 0) * 10) / 10,
          fat_g: Math.round((item.fat_total_g || 0) * 10) / 10,
        }));
    }
  } catch(e) {
    console.log('CalorieNinjas failed:', e.message);
  }

  // Fall back to Open Food Facts if CalorieNinjas returned nothing useful
  if (results.length === 0) {
    try {
      const offRes = await fetch(
        `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=10&fields=product_name,brands,nutriments`,
        { headers: { 'User-Agent': 'MacroSnap/1.0' } }
      );
      const offData = await offRes.json();
      const seen = new Set();
      results = (offData.hits || [])
        .map(p => {
          const n = p.nutriments || {};
          const calories = parseFloat(n['energy-kcal_100g'] || 0);
          const protein = parseFloat(n['proteins_100g'] || 0);
          const carbs = parseFloat(n['carbohydrates_100g'] || 0);
          const fat = parseFloat(n['fat_100g'] || 0);
          if (!calories || !p.product_name) return null;
          const brandsRaw = Array.isArray(p.brands) ? p.brands[0] : p.brands;
          const brand = brandsRaw ? toTitleCase(String(brandsRaw).split(',')[0].trim()) : null;
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
        .sort((a, b) => a.food.length - b.food.length)
        .slice(0, 6);
    } catch(e) {
      console.log('Open Food Facts failed:', e.message);
    }
  }

  res.status(200).json({ results });
}
