import {
  Box,
  Typography,
  Button
} from "@mui/material";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
import { useAuthToken, getUserDetailsFromToken } from "../hooks/auth";
import { fetchBalance, fetchTransactions, transfer } from "../utils/api";
import SaldoCard from "../components/SaldoCard";
import QuickActions from "../components/QuickActions";
import SendMoneyDialog from "../components/SendMoneyDialog";
import TransactionsList from "../components/TransactionsList";

export default function Home() {
  const { signOut } = useAuthenticator();
  const authToken = useAuthToken();
  const [balance, setBalance] = useState<string>("0.00");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!authToken) return;
    // Estrai la mail dall'authToken
    try {
      const details = getUserDetailsFromToken(authToken);
      setUserEmail(details.email);
    } catch {
      setUserEmail(null);
    }
    setLoading(true);
    fetchBalance(authToken)
      .then((data) => setBalance(Number(data.balance).toFixed(2)))
      .catch(() => setBalance("0.00"));
    fetchTransactions(authToken)
      .then((data) => setTransactions(data || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [authToken]);

  const handleSendMoney = async () => {
    setSendError(null);
    setSending(true);
    try {
      await transfer(authToken!, Number(amount), recipient);
      setSendOpen(false);
      setRecipient("");
      setAmount("");
      // Aggiorna saldo e transazioni dopo invio
      fetchBalance(authToken!).then((data) => setBalance(Number(data.balance).toFixed(2)));
      fetchTransactions(authToken!).then((data) => setTransactions(data || []));
    } catch (e: any) {
      setSendError(e.message || "Errore nell'invio");
    } finally {
      setSending(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", mt: 6, mb: 6 }}>
      {/* Ciao e mail */}
      {userEmail && (
        <Typography variant="h5" fontWeight={600} mb={2}>
          Ciao, {userEmail}
        </Typography>
      )}

      {/* Saldo */}
      <SaldoCard balance={balance} />

      {/* Azioni rapide */}
      <QuickActions
        loading={loading}
        onSendClick={() => setSendOpen(true)}
      />

      {/* Dialog invio denaro */}
      <SendMoneyDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        recipient={recipient}
        setRecipient={setRecipient}
        amount={amount}
        setAmount={setAmount}
        sending={sending}
        sendError={sendError}
        onSend={handleSendMoney}
      />

      {/* Lista transazioni */}
      <TransactionsList
        loading={loading}
        transactions={transactions}
      />

      {/* Logout */}
      <Button
        onClick={signOut}
        variant="contained"
        color="error"
        sx={{
          mt: 6,
          px: 6,
          py: 2,
          borderRadius: 2,
          fontWeight: 600,
          textTransform: "none",
        }}
      >
        Esci
      </Button>
    </Box>
  );
}