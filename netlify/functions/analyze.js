exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { imageBase64, imageMimeType, weight, extra } = JSON.parse(event.body);

  const prompt = `Identify the food in this image and calculate nutrition for exactly ${weight}g of it.${extra ? ' Additional info: ' + extra : ''}

Important: The portion is ${weight}g. Use standard nutrition data per 100g and scale to ${weight}g.

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
        { role: 'system', content: 'You are a nutrition calculator. You only respond with raw JSON objects, nothing else. No markdown, no backticks, no explanation.' },
        { role: 'user', content: [
          { type: 'image_url', image_url: { url: `data:${imageMimeType};base64,${imageBase64}` } },
          { type: 'text', text: prompt }
        ]}
      ]
    })
  });

  const data = await response.json();

  if (data.error) {
    return { statusCode: 500, body: JSON.stringify({ error: data.error.message }) };
  }

  const raw = data.choices[0].message.content;
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse nutrition data, try again' }) };
  }

  let result;
  try {
    result = JSON.parse(jsonMatch[0]);
  } catch(e) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not parse nutrition data, try again' }) };
  }

  // Force all numeric fields to actual numbers
  const clean = {
    food: String(result.food || 'Unknown food'),
    calories: parseFloat(result.calories) || 0,
    protein_g: parseFloat(result.protein_g) || 0,
    carbs_g: parseFloat(result.carbs_g) || 0,
    fat_g: parseFloat(result.fat_g) || 0,
  };

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(clean)
  };
};
