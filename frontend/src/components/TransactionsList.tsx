import {
  Card,
  CardContent,
  Typography,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Divider,
} from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import React from "react";

interface TransactionsListProps {
  loading: boolean;
  transactions: any[];
}

export default function TransactionsList({ loading, transactions }: TransactionsListProps) {
  return (
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
                            ? "Pagamento ricevuto"
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
  );
}
