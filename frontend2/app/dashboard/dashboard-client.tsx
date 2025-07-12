"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCurrentUser, signOut, getUsernameFromToken } from "@/lib/auth"
import { getBalance, getTransactions } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowUpRight, ArrowDownLeft, Send, History, LogOut, RefreshCw, DollarSign, Loader2, HandCoins, MessageSquare, Wifi, WifiOff } from "lucide-react"
import TransferModal from "@/components/transfer-modal"
import RequestMoneyModal from "@/components/request-money-modal"
import { formatCurrency, formatDate } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { configureAmplify } from "@/lib/amplify-config"
import { useWebSocket, WebSocketNotification } from "@/hooks/useWebSocket"

interface Transaction {
  transactionId: { S: string }
  amount: { N: string }
  date: { S: string }
  to?: { S: string }
  from?: { S: string }
  toEmail?: { S: string }
  fromEmail?: { S: string }
  toUsername?: { S: string }
  fromUsername?: { S: string }
}

export default function DashboardClient() {
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState<string>("")
  const [balance, setBalance] = useState("0")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [requestModalOpen, setRequestModalOpen] = useState(false)
  const router = useRouter()

  const { isConnected, connectionStatus } = useWebSocket({
    onNotification: (notification: WebSocketNotification) => {
      console.log('WebSocket notification received:', notification)
      
      switch (notification.type) {
        case 'TRANSACTION':       
        refreshData()
          

          const transactionData = notification.data
          if (transactionData.type === 'RECEIVED') {
            toast({
              title: "💰 Payment received!",
              description: `You received ${formatCurrency(transactionData.amount)} from ${transactionData.from.username || transactionData.from.email}`,
              duration: 5000,
            })
          } else if (transactionData.type === 'SENT') {
            toast({
              title: "✅ Payment sent!",
              description: `You sent ${formatCurrency(transactionData.amount)} to ${transactionData.to.username || transactionData.to.email}`,
              duration: 5000,
            })
          }
          break
          
        case 'REQUEST':
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
          break
          
        case 'BALANCE_UPDATE':
          setBalance(notification.data.balance.toString())
          break
      }
    },
    onConnect: () => {
      console.log('WebSocket connected - Real-time notifications active')
    },
    onDisconnect: () => {
      console.log('WebSocket disconnected - Real-time notifications unavailable')
    },
    onError: (error) => {
      if (error.type && error.type !== 'error') {
        console.error('WebSocket error:', error);
      } else {
        console.debug('WebSocket event (non-critical):', error);
      }
    }
  })

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        configureAmplify()
        
        const currentUser = await getCurrentUser()
        console.log("Current user:", currentUser?.signInDetails?.loginId)
        if (!currentUser) {
          router.push("/auth/login")
          return
        }

        setUser(currentUser)

        const usernameFromToken = await getUsernameFromToken()
        setUsername(usernameFromToken || currentUser?.signInDetails?.loginId?.split('@')[0] || "User")

        const [userBalance, userTransactions] = await Promise.all([
          getBalance().catch(() => 0),
          getTransactions().catch(() => []),
        ])

        setBalance(userBalance.toString())
        setTransactions(userTransactions)
      } catch (error: any) {
        console.error("Authentication or data loading error:", error)
        if (error.message?.includes("Auth UserPool not configured")) {
          try {
            configureAmplify()
            const currentUser = await getCurrentUser()
            if (currentUser) {
              setUser(currentUser)
              const usernameFromToken = await getUsernameFromToken()
              setUsername(usernameFromToken || currentUser?.signInDetails?.loginId?.split('@')[0] || "User")
              
              const [userBalance, userTransactions] = await Promise.all([
                getBalance().catch(() => 0),
                getTransactions().catch(() => []),
              ])
              
              setBalance(userBalance.toString())
              setTransactions(userTransactions)
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

  const refreshData = async () => {
    setDataLoading(true)

    try {
      const [newBalance, newTransactions] = await Promise.all([getBalance(), getTransactions()])
      setBalance(newBalance.toString())
      setTransactions(newTransactions)
    } catch (error: any) {
      console.error("Error refreshing data:", error)
      toast({
        variant: "destructive",
        title: "Error refreshing data",
        description: "Failed to refresh data. Please try again.",
      })
    } finally {
      setDataLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push("/auth/login")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = new Date(a.date.S).getTime()
    const dateB = new Date(b.date.S).getTime()
    return dateB - dateA
  })

  const recentTransactions = sortedTransactions.slice(0, 5)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold">P</span>
              </div>
              <h1 className="text-xl font-semibold text-gray-900">LambdaPay</h1>
            </div>

            <div className="flex items-center space-x-4">
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

              <Button variant="ghost" size="icon" onClick={refreshData} disabled={dataLoading}>
                <RefreshCw className={`h-4 w-4 ${dataLoading ? "animate-spin" : ""}`} />
              </Button>

              <Avatar>
                <AvatarFallback>{username.charAt(0).toUpperCase()}</AvatarFallback>
              </Avatar>

              <Button variant="ghost" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {username}
          </h2>
          <p className="text-gray-600">Manage your money with ease</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Balance Card */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <DollarSign className="h-5 w-5 mr-2 text-green-600" />
                  Your Balance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600 mb-4">
                  {formatCurrency(Number.parseFloat(balance))}
                </div>
                <div className="space-y-3">
                  <Button className="w-full" onClick={() => setTransferModalOpen(true)}>
                    <Send className="h-4 w-4 mr-2" />
                    Send Money
                  </Button>
                  <Button 
                    variant="outline" 
                    className="w-full" 
                    onClick={() => setRequestModalOpen(true)}
                  >
                    <HandCoins className="h-4 w-4 mr-2" />
                    Request Money
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full bg-transparent"
                    onClick={() => router.push("/requests")}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Money Requests
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full bg-transparent"
                    onClick={() => router.push("/transactions")}
                  >
                    <History className="h-4 w-4 mr-2" />
                    View All Transactions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Recent Transactions</CardTitle>
                <CardDescription>Your latest financial activity</CardDescription>
              </CardHeader>
              <CardContent>
                {recentTransactions.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <History className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No transactions yet</p>
                    <p className="text-sm">Start by sending money to someone!</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {recentTransactions.map((transaction) => {
                      const amount = Number.parseFloat(transaction.amount.N)
                      const isOutgoing = amount < 0
                      const date = new Date(transaction.date.S)

                      return (
                        <div
                          key={transaction.transactionId.S}
                          className="flex items-center justify-between p-4 border rounded-lg"
                        >
                          <div className="flex items-center space-x-3">
                            <div className={`p-2 rounded-full ${isOutgoing ? "bg-red-100" : "bg-green-100"}`}>
                              {isOutgoing ? (
                                <ArrowUpRight className="h-4 w-4 text-red-600" />
                              ) : (
                                <ArrowDownLeft className="h-4 w-4 text-green-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-medium">
                                {isOutgoing ? (
                                  <>Sent to <span className="font-bold">{transaction.toUsername?.S}</span></>
                                ) : (
                                  <>Received from <span className="font-bold">{transaction.fromUsername?.S}</span></>
                                )}
                              </p>
                              <p className="text-sm text-gray-500">
                                {isOutgoing
                                  ? transaction.toEmail?.S || transaction.to?.S?.substring(0, 16) + "..."
                                  : transaction.fromEmail?.S || transaction.from?.S?.substring(0, 16) + "..."}
                              </p>
                              <p className="text-sm text-gray-500">{formatDate(date)}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`font-semibold ${isOutgoing ? "text-red-600" : "text-green-600"}`}>
                              {isOutgoing ? "-" : "+"}
                              {formatCurrency(Math.abs(amount))}
                            </p>
                            <Badge 
                              variant={isOutgoing ? "destructive" : "secondary"} 
                              className={`text-xs ${!isOutgoing ? "bg-green-100 text-green-800 hover:bg-green-200" : ""}`}
                            >
                              {isOutgoing ? "Sent" : "Received"}
                            </Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <TransferModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        onSuccess={refreshData}
        currentBalance={parseInt(balance)}
      />
      
      <RequestMoneyModal
        open={requestModalOpen}
        onClose={() => setRequestModalOpen(false)}
        onSuccess={refreshData}
      />
    </div>
  )
}
