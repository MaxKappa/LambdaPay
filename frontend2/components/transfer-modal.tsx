"use client"

import type React from "react"

import { useState } from "react"
import { transfer } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, Send, CheckCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

interface TransferModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  currentBalance: number
}

export default function TransferModal({ open, onClose, onSuccess, currentBalance }: TransferModalProps) {
  const [recipientEmail, setRecipientEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    const numericAmount = Number.parseFloat(amount)

    if (isNaN(numericAmount) || numericAmount <= 0) {
      toast({
        variant: "destructive",
        title: "Invalid amount",
        description: "Please enter a valid amount",
      })
      setLoading(false)
      return
    }

    if (numericAmount > currentBalance) {
      toast({
        variant: "destructive",
        title: "Insufficient balance",
        description: "You don't have enough balance for this transfer",
      })
      setLoading(false)
      return
    }

    if (!recipientEmail.includes("@")) {
      toast({
        variant: "destructive",
        title: "Invalid email",
        description: "Please enter a valid email address",
      })
      setLoading(false)
      return
    }

    try {
      const result = await transfer(numericAmount, recipientEmail)
      
      if (result.success) {
        setSuccess(true)
        toast({
          title: "Transfer successful",
          description: `Successfully transferred ${formatCurrency(numericAmount)} to ${recipientEmail}`,
        })
        setTimeout(() => {
          setSuccess(false)
          onSuccess()
          handleClose()
        }, 2000)
      } else {
        toast({
          variant: "destructive",
          title: "Transfer failed",
          description: result.message || "Transfer failed",
        })
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setRecipientEmail("")
    setAmount("")
    setSuccess(false)
    onClose()
  }

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Transfer Successful!</h3>
            <p className="text-gray-600 text-center">
              {formatCurrency(Number.parseFloat(amount))} has been sent to {recipientEmail}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Send className="h-5 w-5 mr-2" />
            Send Money
          </DialogTitle>
          <DialogDescription>Transfer money to another LambdaPay user</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="recipient">Recipient Email</Label>
            <Input
              id="recipient"
              type="email"
              placeholder="Enter recipient's email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="amount">Amount</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={currentBalance}
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
                required
                disabled={loading}
              />
            </div>
            <p className="text-sm text-gray-500">Available balance: {formatCurrency(currentBalance)}</p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 bg-transparent"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Send {amount && `$${amount}`}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
