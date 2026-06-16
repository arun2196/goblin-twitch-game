export async function addTransaction(env, username, amount, reason) {
  await env.DB.prepare(
    `INSERT INTO transactions (username, amount, reason)
     VALUES (?, ?, ?)`
  ).bind(username, amount, reason).run();
}
