export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query, weight } = req.query;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const portionWeight = parseFloat(weight) || 100;
  const toTitleCase = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

  // Run both APIs in parallel
  const [usdaRes, offRes] = await Promise.allSettled([
    // USDA - great for fresh/raw ingredients
    fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&dataType=SR%20Legacy,Survey%20(FNDDS),Foundation&pageSize=4&api_key=${process.env.USDA_API_KEY}`)
      .then(r => r.json()),
    // Open Food Facts - great for packaged/branded foods
    fetch(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=6&fields=product_name,brands,nutriments`, {
      headers: { 'User-Agent': 'MacroSnap/1.0' }
    }).then(r => r.json())
  ]);

  const seen = new Set();
  const results = [];

  // Parse USDA results
  if (usdaRes.status === 'fulfilled') {
    const foods = usdaRes.value?.foods || [];
    for (const food of foods) {
      let calories = 0, protein = 0, carbs = 0, fat = 0;
      (food.foodNutrients || []).forEach(n => {
        const id = n.nutrientId;
        const val = parseFloat(n.value) || 0;
        if (id === 1008 || id === 2047 || id === 2048) calories = val;
        else if (id === 1003) protein = val;
        else if (id === 1005 || id === 1050) carbs = val;
        else if (id === 1004) fat = val;
      });
      if (!calories) continue;
      const name = toTitleCase(food.description.split(',')[0]);
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const scale = portionWeight / 100;
      results.push({
        food: name,
        brand: null,
        source: 'USDA',
        calories: Math.round(calories * scale),
        protein_g: Math.round(protein * scale * 10) / 10,
        carbs_g: Math.round(carbs * scale * 10) / 10,
        fat_g: Math.round(fat * scale * 10) / 10,
      });
    }
  }

  // Parse Open Food Facts results
  if (offRes.status === 'fulfilled') {
    const hits = offRes.value?.hits || [];
    for (const p of hits) {
      const n = p.nutriments || {};
      const calories = parseFloat(n['energy-kcal_100g'] || 0);
      const protein = parseFloat(n['proteins_100g'] || 0);
      const carbs = parseFloat(n['carbohydrates_100g'] || 0);
      const fat = parseFloat(n['fat_100g'] || 0);
      if (!calories || !p.product_name) continue;
      const brandsRaw = Array.isArray(p.brands) ? p.brands[0] : p.brands;
      const brand = brandsRaw ? toTitleCase(String(brandsRaw).split(',')[0].trim()) : null;
      const name = toTitleCase(p.product_name.trim());
      const brandInName = brand && name.toLowerCase().includes(brand.toLowerCase().split(' ')[0]);
      const displayName = (brand && !brandInName) ? `${brand} ${name}` : name;
      const key = displayName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const scale = portionWeight / 100;
      results.push({
        food: displayName,
        brand,
        source: 'OFF',
        calories: Math.round(calories * scale),
        protein_g: Math.round(protein * scale * 10) / 10,
        carbs_g: Math.round(carbs * scale * 10) / 10,
        fat_g: Math.round(fat * scale * 10) / 10,
      });
    }
  }

  // Sort: shorter names first (more generic = more likely what user wants)
  // USDA results first since they're more accurate for fresh foods
  results.sort((a, b) => {
    if (a.source !== b.source) return a.source === 'USDA' ? -1 : 1;
    return a.food.length - b.food.length;
  });

  res.status(200).json({ results: results.slice(0, 6) });
}
