import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Typography,
  CircularProgress,
} from "@mui/material";

interface SendMoneyDialogProps {
  open: boolean;
  onClose: () => void;
  recipient: string;
  setRecipient: (v: string) => void;
  amount: string;
  setAmount: (v: string) => void;
  sending: boolean;
  sendError: string | null;
  onSend: () => void;
}

export default function SendMoneyDialog({
  open,
  onClose,
  recipient,
  setRecipient,
  amount,
  setAmount,
  sending,
  sendError,
  onSend,
}: SendMoneyDialogProps) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
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
        <Button onClick={onClose} disabled={sending}>Annulla</Button>
        <Button
          onClick={onSend}
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
  );
}
