export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const { query, weight } = req.query;
  if (!query) return res.status(400).json({ error: 'No query provided' });

  const portionWeight = parseFloat(weight) || 100;

  const response = await fetch(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=10&fields=product_name,brands,nutriments`,
    { headers: { 'User-Agent': 'MacroSnap/1.0 (nutrition tracker app)' } }
  );

  if (!response.ok) return res.status(500).json({ error: 'Search service unavailable, try again' });

  const data = await response.json();
  if (!data.hits || data.hits.length === 0) return res.status(200).json({ results: [] });

  const toTitleCase = s => String(s).toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
  const seen = new Set();

  const results = data.hits
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
        // score: shorter names that closely match the query rank higher
        _score: displayName.toLowerCase().includes(query.toLowerCase()) ? -displayName.length : 0,
        calories: Math.round(calories * scale),
        protein_g: Math.round(protein * scale * 10) / 10,
        carbs_g: Math.round(carbs * scale * 10) / 10,
        fat_g: Math.round(fat * scale * 10) / 10,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a._score - b._score)
    .map(({ _score, ...r }) => r)
    .slice(0, 6);

  res.status(200).json({ results });
}
