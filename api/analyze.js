export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { imageBase64, imageMimeType, weight, extra } = req.body;

  const prompt = `Identify the food in this image and calculate nutrition for exactly ${weight}g of it.${extra ? ' Additional info: ' + extra : ''}

The portion is ${weight}g. Use standard nutrition data per 100g and scale to ${weight}g.

Respond with ONLY this JSON, nothing else:
{"food":"name","calories":number,"protein_g":number,"carbs_g":number,"fat_g":number}`;

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`
    },
    body: JSON.stringify({
      model: 'nvidia/nemotron-nano-12b-v2-vl:free',
      max_tokens: 256,
      messages: [
        { role: 'system', content: 'You are a nutrition calculator. Respond only with a raw JSON object. No markdown, no backticks, no text before or after the JSON.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt }
        ]}
      ]
    })
  });

  const data = await response.json();
  if (data.error) return res.status(500).json({ error: data.error.message });

  const raw = data.choices[0].message.content;
  const stripped = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return res.status(500).json({ error: 'Could not parse nutrition data, try again' });

  let result;
  try { result = JSON.parse(jsonMatch[0]); }
  catch(e) { return res.status(500).json({ error: 'Could not parse nutrition data, try again' }); }

  res.status(200).json({
    food: String(result.food || 'Unknown food'),
    calories: parseFloat(result.calories) || 0,
    protein_g: parseFloat(result.protein_g) || 0,
    carbs_g: parseFloat(result.carbs_g) || 0,
    fat_g: parseFloat(result.fat_g) || 0,
  });
}
