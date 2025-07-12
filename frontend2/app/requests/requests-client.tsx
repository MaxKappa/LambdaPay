"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCurrentUser } from "aws-amplify/auth"
import { getRequests, handleRequest } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, Check, X, HandCoins, Send, Clock, Wifi, WifiOff } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { configureAmplify } from "@/lib/amplify-config"
import { useWebSocket, WebSocketNotification } from "@/hooks/useWebSocket"

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

  const { isConnected } = useWebSocket({
    onNotification: (notification: WebSocketNotification) => {
      if (notification.type === 'REQUEST') {
        loadRequests()
        const requestData = notification.data
        if (requestData.type === 'NEW_REQUEST') {
          toast({
            title: "💳 New money request",
            description: `${requestData.from.username || requestData.from.email} has requested ${formatCurrency(requestData.amount)} from you`,
            duration: 5000,
          })
        } else if (requestData.type === 'ACCEPTED') {
          toast({
            title: "✅ Request accepted!",
            description: `Your request for ${formatCurrency(requestData.amount)} has been accepted`,
            duration: 5000,
          })
        } else if (requestData.type === 'REJECTED') {
          toast({
            title: "❌ Request rejected",
            description: `Your request for ${formatCurrency(requestData.amount)} has been rejected`,
            duration: 5000,
          })
        }
      }
    }
  })

  const loadRequests = async () => {
    try {
      const [received, sent] = await Promise.all([
        getRequests('received'),
        getRequests('sent')
      ])
      setReceivedRequests(received)
      setSentRequests(sent)
    } catch (error) {
      console.error("Error loading requests:", error)
      setError("Failed to load requests")
    }
  }

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        configureAmplify()
        
        const currentUser = await getCurrentUser()

        if (!currentUser) {
          router.push("/auth/login")
          return
        }

        setUser(currentUser)
        await loadRequests()
      } catch (error: any) {
        console.error("Authentication or data loading error:", error)
        if (error.message?.includes("Auth UserPool not configured")) {
          try {
            configureAmplify()
            const currentUser = await getCurrentUser()
            if (currentUser) {
              setUser(currentUser)
              await loadRequests()
              return
            }
          } catch (retryError) {
            console.error("Retry failed:", retryError)
          }
        }
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuthAndLoadData()
  }, [router])

  const handleRespond = async (requestId: string, action: 'ACCEPT' | 'REJECT') => {
    setProcessingId(requestId)
    setError("")

    try {
      const result = await handleRequest(requestId, action)
      
      if (result.success) {
        await loadRequests()
        toast({
          title: action === 'ACCEPT' ? "Request accepted" : "Request rejected",
          description: action === 'ACCEPT' 
            ? "The money request has been accepted successfully." 
            : "The money request has been rejected.",
        })
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.message || "Failed to respond to request",
        })
      }
    } catch (error: any) {
      console.error("Error responding to request:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      })
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

  const sortedReceivedRequests = [...receivedRequests].sort((a, b) => {
    const dateA = new Date(a.createdAt.S).getTime()
    const dateB = new Date(b.createdAt.S).getTime()
    return dateB - dateA
  })

  const sortedSentRequests = [...sentRequests].sort((a, b) => {
    const dateA = new Date(a.createdAt.S).getTime()
    const dateB = new Date(b.createdAt.S).getTime()
    return dateB - dateA
  })

  const currentRequests = activeTab === 'received' ? sortedReceivedRequests : sortedSentRequests

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
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Button variant="ghost" onClick={() => router.back()} className="mr-4">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <h1 className="text-xl font-semibold text-gray-900">Money Requests</h1>
            </div>
            
            <div 
              className={`flex items-center space-x-1 px-2 py-1 rounded-full text-xs ${
                isConnected 
                  ? "bg-green-100 text-green-800" 
                  : "bg-red-100 text-red-800"
              }`}
              title={isConnected ? "Real-time notifications active" : "Real-time notifications unavailable"}
            >
              {isConnected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span>{isConnected ? "Live" : "Offline"}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Money Requests</CardTitle>
            <CardDescription>Manage your incoming and outgoing money requests</CardDescription>

            <div className="flex gap-2 mt-4">
              <Button 
                variant={activeTab === 'received' ? "default" : "outline"} 
                size="sm" 
                onClick={() => setActiveTab('received')}
              >
                <HandCoins className="w-4 h-4 mr-2" />
                Received ({sortedReceivedRequests.filter(r => r.status.S === 'PENDING').length})
              </Button>
              <Button 
                variant={activeTab === 'sent' ? "default" : "outline"} 
                size="sm" 
                onClick={() => setActiveTab('sent')}
              >
                <Send className="w-4 h-4 mr-2" />
                Sent ({sortedSentRequests.length})
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
                  const amount = parseInt(request.amount.N) 
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
