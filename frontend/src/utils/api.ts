const API_BASE = import.meta.env.VITE_API_BASE_URL 

export async function fetchBalance(token: string) {
  const res = await fetch(`${API_BASE}/balance`, {
    headers: { 
      Authorization: token
    }
  });
  if (!res.ok) throw new Error("Errore nel recupero del saldo");
  return res.json();
}

export async function fetchTransactions(token: string) {
  const res = await fetch(`${API_BASE}/transactions`, {
    headers: { 
        Authorization: token
     }
  });
  if (!res.ok) throw new Error("Errore nel recupero delle transazioni");
  return res.json();
}

export async function transfer(token: string, amount: number, recipientId: string) {
  const res = await fetch(`${API_BASE}/transfer`, {
    method: "POST",
    headers: {
      Authorization: token,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ amount, recipientId })
  });
  if (!res.ok) throw new Error("Errore nel trasferimento");
  return res.json();
}