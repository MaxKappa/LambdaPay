import AppBar from "@mui/material/AppBar";
import Box from "@mui/material/Box";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import { Link as RouterLink } from "react-router-dom";

interface NavbarProps {
  minimal?: boolean;
}

export default function Navbar({ minimal }: NavbarProps) {
  return (
    <Box sx={{ flexGrow: 1, marginBottom: 4 }}>
      <AppBar position="static" color="default" elevation={2}>
        <Toolbar>
          <Typography
            variant="h6"
            component={RouterLink}
            to="/"
            sx={{
              flexGrow: 1,
              textDecoration: "none",
              color: "primary.main",
              fontWeight: "bold",
            }}
          >
            LambdaPay
          </Typography>
          {!minimal && (
            <>
              <Button
                color="primary"
                component={RouterLink}
                to="/"
                sx={{ fontWeight: 500 }}
              >
                Wallet
              </Button>
              <Button
                color="primary"
                component={RouterLink}
                to="/about"
                sx={{ fontWeight: 500 }}
              >
                About
              </Button>
            </>
          )}
        </Toolbar>
      </AppBar>
    </Box>
  );
}