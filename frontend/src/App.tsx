import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import '@aws-amplify/ui-react/styles.css';
import ConfigureAmplifyClientSide from './config';
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import Navbar from "./components/Navbar";


ConfigureAmplifyClientSide();

function AppRoutes() {
  const { user } = useAuthenticator((context) => [context.user]);
  return (
    <>
      <Navbar minimal={!user} />
      <Routes>
        <Route path="/" element={user ? <Home /> : null} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <Authenticator.Provider>
      <AppRoutes />
      <Authenticator socialProviders={['apple', 'facebook', 'google']} />
    </Authenticator.Provider>
  );
}