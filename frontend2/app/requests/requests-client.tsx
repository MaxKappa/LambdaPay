"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCurrentUser } from "aws-amplify/auth"
import { getRequests, respondToRequest } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ArrowLeft, Loader2, Check, X, HandCoins, Send, Clock } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface MoneyRequest {
  requestId: { S: string }
  fromUserId: { S: string }
  toUserId: { S: string }
  amount: { N: string }
  message: { S: string }
  status: { S: string }
  createdAt: { S: string }
  fromEmail: { S: string }
  toEmail: { S: string }
  fromUsername: { S: string }
  toUsername: { S: string }
}

export default function RequestsClient() {
  const [user, setUser] = useState<any>(null)
  const [receivedRequests, setReceivedRequests] = useState<MoneyRequest[]>([])
  const [sentRequests, setSentRequests] = useState<MoneyRequest[]>([])
  const [activeTab, setActiveTab] = useState<'received' | 'sent'>('received')
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const router = useRouter()

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        const currentUser = await getCurrentUser()

        if (!currentUser) {
          router.push("/auth/login")
          return
        }

        setUser(currentUser)
        await loadRequests()
      } catch (error) {
        console.error("Authentication or data loading error:", error)
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuthAndLoadData()
  }, [router])

  const loadRequests = async () => {
    try {
      const [received, sent] = await Promise.all([
        getRequests('received'),
        getRequests('sent')
      ])
      setReceivedRequests(received)
      setSentRequests(sent)
    } catch (error: any) {
      console.error("Error loading requests:", error)
      setError("Failed to load requests. Please try again.")
    }
  }

  const handleRespond = async (requestId: string, action: 'ACCEPT' | 'REJECT') => {
    setProcessingId(requestId)
    setError("")

    try {
      await respondToRequest(requestId, action)
      await loadRequests() // Ricarica le richieste
    } catch (error: any) {
      console.error("Error responding to request:", error)
      setError(error.message || "Failed to respond to request")
    } finally {
      setProcessingId(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading requests...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const currentRequests = activeTab === 'received' ? receivedRequests : sentRequests

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </Badge>
      case 'ACCEPTED':
        return <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200">
          <Check className="w-3 h-3 mr-1" />
          Accepted
        </Badge>
      case 'REJECTED':
        return <Badge variant="secondary" className="bg-red-100 text-red-800 hover:bg-red-200">
          <X className="w-3 h-3 mr-1" />
          Rejected
        </Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16">
            <Button variant="ghost" onClick={() => router.back()} className="mr-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-xl font-semibold text-gray-900">Money Requests</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="mb-6">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Money Requests</CardTitle>
            <CardDescription>Manage your incoming and outgoing money requests</CardDescription>

            {/* Tabs */}
            <div className="flex gap-2 mt-4">
              <Button 
                variant={activeTab === 'received' ? "default" : "outline"} 
                size="sm" 
                onClick={() => setActiveTab('received')}
              >
                <HandCoins className="w-4 h-4 mr-2" />
                Received ({receivedRequests.filter(r => r.status.S === 'PENDING').length})
              </Button>
              <Button 
                variant={activeTab === 'sent' ? "default" : "outline"} 
                size="sm" 
                onClick={() => setActiveTab('sent')}
              >
                <Send className="w-4 h-4 mr-2" />
                Sent ({sentRequests.length})
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {currentRequests.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <HandCoins className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No {activeTab} requests</p>
                <p className="text-sm">
                  {activeTab === 'received' 
                    ? 'You haven\'t received any money requests yet' 
                    : 'You haven\'t sent any money requests yet'
                  }
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {currentRequests.map((request) => {
                  const amount = Number.parseFloat(request.amount.N)
                  const isPending = request.status.S === 'PENDING'
                  const isReceived = activeTab === 'received'

                  return (
                    <div
                      key={request.requestId.S}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="p-3 rounded-full bg-blue-100">
                          <HandCoins className="h-6 w-6 text-blue-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
                            {isReceived 
                              ? `${request.fromUsername.S} requests money` 
                              : `Request to ${request.toUsername.S}`
                            }
                          </p>
                          <p className="text-sm text-gray-500">
                            {isReceived ? request.fromEmail.S : request.toEmail.S}
                          </p>
                          {request.message.S && (
                            <p className="text-sm text-gray-600 italic mt-1">
                              "{request.message.S}"
                            </p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">
                            {formatDate(request.createdAt.S)}
                          </p>
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-4">
                        <div>
                          <p className="text-lg font-semibold text-gray-900">
                            {formatCurrency(amount)}
                          </p>
                          {getStatusBadge(request.status.S)}
                        </div>

                        {isReceived && isPending && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRespond(request.requestId.S, 'REJECT')}
                              disabled={processingId === request.requestId.S}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            >
                              {processingId === request.requestId.S ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <X className="h-4 w-4" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleRespond(request.requestId.S, 'ACCEPT')}
                              disabled={processingId === request.requestId.S}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              {processingId === request.requestId.S ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Check className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
