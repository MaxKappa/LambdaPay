"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCurrentUser, signOut } from "@/lib/auth"
import { getBalance, getTransactions } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowUpRight, ArrowDownLeft, Send, History, LogOut, RefreshCw, DollarSign, Loader2 } from "lucide-react"
import TransferModal from "@/components/transfer-modal"
import { formatCurrency, formatDate } from "@/lib/utils"

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
  const [balance, setBalance] = useState("0")
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [dataLoading, setDataLoading] = useState(false)
  const [transferModalOpen, setTransferModalOpen] = useState(false)
  const [error, setError] = useState("")
  const router = useRouter()

  // Check authentication and load initial data
  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        const currentUser = await getCurrentUser()
        console.log("Current user:", currentUser?.signInDetails?.loginId)
        if (!currentUser) {
          router.push("/auth/login")
          return
        }

        setUser(currentUser)

        // Load user data
        const [userBalance, userTransactions] = await Promise.all([
          getBalance().catch(() => "0"),
          getTransactions().catch(() => []),
        ])

        setBalance(userBalance)
        setTransactions(userTransactions)
      } catch (error) {
        console.error("Authentication or data loading error:", error)
        router.push("/auth/login")
      } finally {
        setLoading(false)
      }
    }

    checkAuthAndLoadData()
  }, [router])

  const refreshData = async () => {
    setDataLoading(true)
    setError("")

    try {
      const [newBalance, newTransactions] = await Promise.all([getBalance(), getTransactions()])
      setBalance(newBalance)
      setTransactions(newTransactions)
    } catch (error: any) {
      console.error("Error refreshing data:", error)
      setError("Failed to refresh data. Please try again.")
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

  // Show loading spinner while checking authentication
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

  // Don't render anything if user is not authenticated (redirect is in progress)
  if (!user) {
    return null
  }

  const recentTransactions = transactions.slice(0, 5)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
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
              <Button variant="ghost" size="icon" onClick={refreshData} disabled={dataLoading}>
                <RefreshCw className={`h-4 w-4 ${dataLoading ? "animate-spin" : ""}`} />
              </Button>

              <Avatar>
                <AvatarFallback>{user?.signInDetails?.loginId?.charAt(0).toUpperCase() || "U"}</AvatarFallback>
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
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome back, {user.signInDetails?.loginId || "User"}
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

          {/* Recent Transactions */}
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
                            <Badge variant={isOutgoing ? "destructive" : "default"} className="text-xs">
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
        currentBalance={Number.parseFloat(balance)}
      />
    </div>
  )
}
