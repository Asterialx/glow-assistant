/** Budget admission is server-only; browser credentials cannot spend/refund credits. */
export async function admitRequest(client, userId, requestId, reservation, model) {
  const { data, error } = await client.rpc('glow_reserve_tokens', {
    p_user: userId, p_request: requestId, p_reserve: reservation, p_model: model,
  });
  if (error) return { status: 503, message: 'Request limits unavailable. Try again later.' };
  const failures = {
    inactive: [403, 'Access denied'],
    credits: [429, 'Insufficient token allowance for this request'],
    rate: [429, 'Too many requests. Please wait a minute'],
    concurrent: [409, 'An answer is already being generated on another device'],
    budget: [429, 'Daily beta request limit reached. Try again tomorrow'],
    disabled: [503, 'AI temporarily unavailable'],
  };
  if (data === 'accepted') return null;
  const [status, message] = failures[data] || [503, 'Request limits unavailable. Try again later.'];
  return { status, message };
}

/** Wait for backpressure without hanging forever if the browser disconnects. */
export function waitForDrain(res) {
  return new Promise(resolve => {
    const done = () => {
      res.off('drain', done);
      res.off('close', done);
      res.off('error', done);
      resolve();
    };
    res.once('drain', done);
    res.once('close', done);
    res.once('error', done);
    if (res.destroyed) done();
  });
}
