import { Grid, Button } from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import AddIcon from "@mui/icons-material/Add";

interface QuickActionsProps {
  loading: boolean;
  onSendClick: () => void;
}

export default function QuickActions({ loading, onSendClick }: QuickActionsProps) {
  return (
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
          onClick={onSendClick}
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
  );
}
