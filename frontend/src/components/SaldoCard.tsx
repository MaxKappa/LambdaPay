import { Card, CardContent, Stack, Avatar, Typography, Box } from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";

interface SaldoCardProps {
  balance: string;
}

export default function SaldoCard({ balance }: SaldoCardProps) {
  return (
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
  );
}
