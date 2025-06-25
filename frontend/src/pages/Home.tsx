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
import { useAuthToken } from "../hooks/auth";
import { fetchBalance, fetchTransactions } from "../utils/api";

export default function Home() {
  const { signOut } = useAuthenticator();
  const authToken = useAuthToken();
  const [balance, setBalance] = useState<string>("0.00");
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authToken) return;
    setLoading(true);
    fetchBalance(authToken)
      .then((data) => setBalance(Number(data.balance).toFixed(2)))
      .catch(() => setBalance("0.00"));
    fetchTransactions(authToken)
      .then((data) => setTransactions(data || []))
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [authToken]);

  return (
    <Box sx={{ maxWidth: 600, mx: "auto", mt: 6, mb: 6 }}>
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
            disabled
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
              transactions.map((tx, idx) => (
                <React.Fragment key={tx.transactionId || idx}>
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar
                        sx={{
                          bgcolor:
                            Number(tx.amount) >= 0
                              ? "success.light"
                              : "error.light",
                        }}
                      >
                        {Number(tx.amount) >= 0 ? (
                          <ArrowDownwardIcon color="success" />
                        ) : (
                          <ArrowUpwardIcon color="error" />
                        )}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        Number(tx.amount) >= 0
                          ? "Bonifico ricevuto"
                          : "Pagamento inviato"
                      }
                      secondary={tx.date || ""}
                    />
                    <Typography
                      color={
                        Number(tx.amount) >= 0 ? "success.main" : "error.main"
                      }
                      fontWeight={600}
                    >
                      {Number(tx.amount) >= 0 ? "+" : "-"}€{" "}
                      {Math.abs(Number(tx.amount)).toFixed(2)}
                    </Typography>
                  </ListItem>
                  <Divider variant="inset" component="li" />
                </React.Fragment>
              ))
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

