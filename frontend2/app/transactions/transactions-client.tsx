"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { getCurrentUser } from "@/lib/auth"
import { getTransactions } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ArrowUpRight, ArrowDownLeft, ArrowLeft, Search, Filter, Loader2 } from "lucide-react"
import { formatCurrency, formatDate } from "@/lib/utils"
import { configureAmplify } from "@/lib/amplify-config"

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

export default function TransactionsClient() {
  const [user, setUser] = useState<any>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [filter, setFilter] = useState<"all" | "sent" | "received">("all")
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const checkAuthAndLoadData = async () => {
      try {
        // Assicurati che Amplify sia configurato prima di controllare l'autenticazione
        configureAmplify()
        
        const currentUser = await getCurrentUser()

        if (!currentUser) {
          router.push("/auth/login")
          return
        }

        setUser(currentUser)

        const userTransactions = await getTransactions().catch(() => [])
        console.log("Transactions loaded:", userTransactions)
        setTransactions(userTransactions)
      } catch (error: any) {
        console.error("Authentication or data loading error:", error)
        // Se l'errore è legato alla configurazione di Amplify, prova a riconfigurare
        if (error.message?.includes("Auth UserPool not configured")) {
          try {
            configureAmplify()
            // Riprova dopo la riconfigurazione
            const currentUser = await getCurrentUser()
            if (currentUser) {
              setUser(currentUser)
              const userTransactions = await getTransactions().catch(() => [])
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Loading transactions...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  // Sort transactions by timestamp in descending order (newest first)
  const sortedTransactions = [...transactions].sort((a, b) => {
    const dateA = new Date(a.date.S).getTime()
    const dateB = new Date(b.date.S).getTime()
    return dateB - dateA
  })

  const filteredTransactions = sortedTransactions.filter((transaction) => {
    const amount = Number.parseFloat(transaction.amount.N)
    const isOutgoing = amount < 0

    // Apply filter
    if (filter === "sent" && !isOutgoing) return false
    if (filter === "received" && isOutgoing) return false

    // Apply search
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase()
      const transactionId = transaction.transactionId.S.toLowerCase()
      const targetEmail = (isOutgoing ? transaction.toEmail?.S : transaction.fromEmail?.S)?.toLowerCase() || ""
      const targetUsername = (isOutgoing ? transaction.toUsername?.S : transaction.fromUsername?.S)?.toLowerCase() || ""

      return transactionId.includes(searchLower) || 
             targetEmail.includes(searchLower) || 
             targetUsername.includes(searchLower)
    }

    return true
  })

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
            <h1 className="text-xl font-semibold text-gray-900">Transaction History</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Card>
          <CardHeader>
            <CardTitle>All Transactions</CardTitle>

            {/* Search and Filter */}
            <div className="flex flex-col sm:flex-row gap-4 mt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search transactions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>

              <div className="flex gap-2">
                <Button variant={filter === "all" ? "default" : "outline"} size="sm" onClick={() => setFilter("all")}>
                  All
                </Button>
                <Button variant={filter === "sent" ? "default" : "outline"} size="sm" onClick={() => setFilter("sent")}>
                  Sent
                </Button>
                <Button
                  variant={filter === "received" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFilter("received")}
                >
                  Received
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {filteredTransactions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Filter className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No transactions found</p>
                <p className="text-sm">Try adjusting your search or filter criteria</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransactions.map((transaction) => {
                  const amount = Number.parseFloat(transaction.amount.N)
                  const isOutgoing = amount < 0
                  const date = new Date(transaction.date.S)

                  return (
                    <div
                      key={transaction.transactionId.S}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center space-x-4">
                        <div className={`p-3 rounded-full ${isOutgoing ? "bg-red-100" : "bg-green-100"}`}>
                          {isOutgoing ? (
                            <ArrowUpRight className="h-5 w-5 text-red-600" />
                          ) : (
                            <ArrowDownLeft className="h-5 w-5 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">
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
                          <p className="text-xs text-gray-400">ID: {transaction.transactionId.S.substring(0, 8)}...</p>
                        </div>
                      </div>

                      <div className="text-right">
                        <p className={`text-lg font-semibold ${isOutgoing ? "text-red-600" : "text-green-600"}`}>
                          {isOutgoing ? "-" : "+"}
                          {formatCurrency(Math.abs(amount))}
                        </p>
                        <p className="text-sm text-gray-500 mb-1">{formatDate(date)}</p>
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
      </main>
    </div>
  )
}
