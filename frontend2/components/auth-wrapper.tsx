"use client"

import type React from "react"

import { createContext, useContext, useEffect, useState } from "react"
import { getCurrentUser } from "@/lib/auth"
import { Loader2 } from "lucide-react"
import { configureAmplify } from "@/lib/amplify-config"

interface AuthContextType {
  user: any | null
  loading: boolean
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshUser = async () => {
    try {
     
      configureAmplify()
      const currentUser = await getCurrentUser()
      setUser(currentUser)
    } catch (error: any) {
      console.error("Error refreshing user:", error)
     
      if (error.message?.includes("Auth UserPool not configured")) {
        try {
          configureAmplify()
          const currentUser = await getCurrentUser()
          setUser(currentUser)
        } catch (retryError) {
          console.error("Retry failed:", retryError)
          setUser(null)
        }
      } else {
        setUser(null)
      }
    }
  }

  useEffect(() => {
    const checkAuth = async () => {
      await refreshUser()
      setLoading(false)
    }

    checkAuth()
  }, [])

  return <AuthContext.Provider value={{ user, loading, refreshUser }}>{children}</AuthContext.Provider>
}

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null
  }

  return <>{children}</>
}
