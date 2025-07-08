import { fetchAuthSession } from "aws-amplify/auth"

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL

async function getAuthHeaders() {
  try {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()

    if (!token) {
      throw new Error("No authentication token available")
    }

    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    }
  } catch (error) {
    throw new Error("Authentication required")
  }
}

export async function getBalance(): Promise<number> {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/balance`, {
      headers,
    })

    if (!response.ok) {
      throw new Error("Failed to fetch balance")
    }

    const data = await response.json()
    // Il backend restituisce i centesimi
    return parseInt(data.balance) || 0
  } catch (error: any) {
    throw new Error(error.message || "Failed to get balance")
  }
}

export async function getTransactions(): Promise<any[]> {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/transactions`, {
      headers,
    })

    if (!response.ok) {
      throw new Error("Failed to fetch transactions")
    }

    const data = await response.json()
    return data || []
  } catch (error: any) {
    throw new Error(error.message || "Failed to get transactions")
  }
}

export async function transfer(amountInCents: number, recipientEmail: string): Promise<{ success: boolean; message?: string }> {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/transfer`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: amountInCents, // Invia i centesimi al backend
        recipientId: recipientEmail,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, message: errorData.message || "Transfer failed" }
    }
    
    return { success: true }
  } catch (error: any) {
    return { success: false, message: error.message || "Transfer failed" }
  }
}

export async function requestMoney(amountInCents: number, recipientEmail: string, message?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/request`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        amount: amountInCents, // Invia i centesimi al backend
        recipientEmail: recipientEmail,
        message: message || '',
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, message: errorData.message || "Request failed" }
    }
    
    return { success: true }
  } catch (error: any) {
    return { success: false, message: error.message || "Request failed" }
  }
}

export async function getRequests(type: 'received' | 'sent' = 'received'): Promise<any[]> {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/requests?type=${type}`, {
      headers,
    })

    if (!response.ok) {
      throw new Error("Failed to fetch requests")
    }

    const data = await response.json()
    return data || []
  } catch (error: any) {
    throw new Error(error.message || "Failed to get requests")
  }
}

export async function handleRequest(requestId: string, action: 'ACCEPT' | 'REJECT'): Promise<{ success: boolean; message?: string }> {
  try {
    const headers = await getAuthHeaders()
    const response = await fetch(`${API_BASE_URL}/request/${requestId}/respond`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        action: action,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      return { success: false, message: errorData.message || "Response failed" }
    }
    
    return { success: true }
  } catch (error: any) {
    return { success: false, message: error.message || "Response failed" }
  }
}
