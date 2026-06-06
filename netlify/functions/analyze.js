exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const { imageBase64, imageMimeType, weight, extra } = JSON.parse(event.body);

  const prompt = `You are a nutrition database. Identify the food in this photo, then calculate the EXACT macros for ${weight}g of it.${extra ? '\n\nExtra context: ' + extra : ''}

Step 1: Identify the food.
Step 2: Look up the nutrition per 100g for that food.
Step 3: Multiply by ${weight}/100 to get the macros for ${weight}g.

For example, if the food has 374 kcal per 100g and the portion is ${weight}g, calories = ${weight} * 3.74 = ${(weight * 3.74).toFixed(0)}.

You MUST respond with ONLY a raw JSON object. No markdown. No backticks. No explanation. No text before or after. Just the JSON.
Example for 250g of Cheerios: {"food":"Cheerios","calories":935,"protein_g":30,"carbs_g":195,"fat_g":15}`;

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
        { role: 'system', content: 'You are a nutrition API. Always respond with only a raw JSON object, no markdown, no backticks, no explanation.' },
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

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: jsonMatch[0]
  };
};
