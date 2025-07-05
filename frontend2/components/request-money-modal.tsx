"use client"

import type React from "react"

import { useState } from "react"
import { requestMoney } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Loader2, HandCoins, CheckCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

interface RequestMoneyModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function RequestMoneyModal({ open, onClose, onSuccess }: RequestMoneyModalProps) {
  const [recipientEmail, setRecipientEmail] = useState("")
  const [amount, setAmount] = useState("")
  const [message, setMessage] = useState("")
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
      const result = await requestMoney(numericAmount, recipientEmail, message)
      
      if (result.success) {
        setSuccess(true)
        toast({
          title: "Request sent",
          description: `Money request for ${formatCurrency(numericAmount)} sent to ${recipientEmail}`,
        })
        setTimeout(() => {
          setSuccess(false)
          onSuccess()
          handleClose()
        }, 2000)
      } else {
        toast({
          variant: "destructive",
          title: "Request failed",
          description: result.message || "Request failed",
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
    setMessage("")
    setSuccess(false)
    onClose()
  }

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md">
          <div className="flex flex-col items-center justify-center py-8">
            <CheckCircle className="h-16 w-16 text-green-600 mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Request Sent!</h3>
            <p className="text-gray-600 text-center">
              Your request for {formatCurrency(Number.parseFloat(amount))} has been sent to {recipientEmail}
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
            <HandCoins className="h-5 w-5 mr-2" />
            Request Money
          </DialogTitle>
          <DialogDescription>Request money from another LambdaPay user</DialogDescription>
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
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="pl-8"
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Add a note for your request..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={loading}
              rows={3}
            />
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
                  <HandCoins className="mr-2 h-4 w-4" />
                  Send Request
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
