import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  Avatar,
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
  Divider,
  Stack,
  Grid,
} from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { useAuthenticator } from "@aws-amplify/ui-react";
import { useEffect, useState } from "react";
import { useAuthToken, getUserDetailsFromToken } from "../hooks/auth";
import { fetchBalance, fetchTransactions, transfer } from "../utils/api";
import React from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";

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
      <Card sx={{ mb: 4, borderRadius: 4, boxShadow: 4 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={2}>
            <Avatar sx={{ bgcolor: "primary.main", width: 56, height: 56 }}>
              <AccountBalanceWalletIcon fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Saldo disponibile
              </Typography>
              <Typography variant="h3" fontWeight={700} color="success.main">
                € {balance}
              </Typography>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      {/* Azioni rapide */}
      <Grid container spacing={2} sx={{ mb: 4 }}>
        <Grid item xs={6}>
          <Button
            variant="contained"
            color="primary"
            fullWidth
            startIcon={<SendIcon />}
            size="large"
            sx={{
              borderRadius: 3,
              py: 2,
              fontWeight: 600,
              textTransform: "none",
            }}
            onClick={() => setSendOpen(true)}
            disabled={loading}
          >
            Invia denaro
          </Button>
        </Grid>
        <Grid item xs={6}>
          <Button
            variant="contained"
            color="success"
            fullWidth
            startIcon={<AddIcon />}
            size="large"
            sx={{
              borderRadius: 3,
              py: 2,
              fontWeight: 600,
              textTransform: "none",
            }}
            disabled
          >
            Ricevi denaro
          </Button>
        </Grid>
      </Grid>

      {/* Dialog invio denaro */}
      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Invia denaro</DialogTitle>
        <DialogContent>
          <TextField
            label="Email destinatario"
            fullWidth
            margin="normal"
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            disabled={sending}
            type="email"
            autoComplete="email"
            placeholder="esempio@email.com"
          />
          <TextField
            label="Importo (€)"
            type="number"
            fullWidth
            margin="normal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            disabled={sending}
            inputProps={{ min: 0.01, step: 0.01 }}
          />
          {sendError && (
            <Typography color="error" variant="body2" mt={1}>
              {sendError}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSendOpen(false)} disabled={sending}>Annulla</Button>
          <Button
            onClick={handleSendMoney}
            variant="contained"
            color="primary"
            disabled={
              sending ||
              !recipient ||
              !amount ||
              isNaN(Number(amount)) ||
              Number(amount) <= 0
            }
            startIcon={sending ? <CircularProgress size={18} /> : null}
          >
            Invia
          </Button>
        </DialogActions>
      </Dialog>

      {/* Lista transazioni */}
      <Card sx={{ borderRadius: 4, boxShadow: 2 }}>
        <CardContent>
          <Typography variant="h6" fontWeight={700} mb={2}>
            Transazioni recenti
          </Typography>
          <List>
            {loading ? (
              <ListItem>
                <ListItemText primary="Caricamento..." />
              </ListItem>
            ) : transactions.length === 0 ? (
              <ListItem>
                <ListItemText
                  primary={
                    <Typography color="text.secondary" fontStyle="italic">
                      Nessuna transazione recente
                    </Typography>
                  }
                />
              </ListItem>
            ) : (
              transactions.map((tx, idx) => {
                const getVal = (v: any) =>
                  v && typeof v === "object"
                    ? v.N ?? v.S ?? v.BOOL ?? v.NULL ?? v
                    : v;

                const rawAmount = getVal(tx.amount);
                const amount = Number(rawAmount);
                const validAmount = !isNaN(amount);
                const date = getVal(tx.date);
                // Format data e ora
                let formattedDate = "";
                if (date) {
                  const d = new Date(date);
                  formattedDate = d.toLocaleDateString("it-IT", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  }) + " " + d.toLocaleTimeString("it-IT", {
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                }
                const transactionId = getVal(tx.transactionId);

                const isPositive = validAmount && amount > 0;
                const isNegative = validAmount && amount <= 0;

                return (
                  <React.Fragment key={transactionId ? String(transactionId) : `tx-${idx}`}>
                    <ListItem>
                      <ListItemAvatar>
                        <Avatar
                          sx={{
                            bgcolor: isPositive
                              ? "success.light"
                              : "error.light",
                          }}
                        >
                          {validAmount
                            ? isPositive
                              ? <ArrowDownwardIcon color="success" />
                              : <ArrowUpwardIcon color="error" />
                            : <ArrowUpwardIcon color="disabled" />}
                        </Avatar>
                      </ListItemAvatar>
                      <ListItemText
                        primary={
                          validAmount
                            ? isPositive
                              ? "Bonifico ricevuto"
                              : "Pagamento inviato"
                            : "Transazione"
                        }
                        secondary={formattedDate || ""}
                      />
                      <Typography
                        color={
                          validAmount
                            ? isPositive
                              ? "success.main"
                              : "error.main"
                            : "text.secondary"
                        }
                        fontWeight={600}
                      >
                        {validAmount
                          ? "€ " + Math.abs(amount).toFixed(2)
                          : "-"}
                      </Typography>
                    </ListItem>
                    {idx < transactions.length - 1 && (
                      <Divider variant="inset" component="li" />
                    )}
                  </React.Fragment>
                );
              })
            )}
          </List>
        </CardContent>
      </Card>

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

