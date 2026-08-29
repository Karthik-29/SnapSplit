import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AppProvider } from './context/AppContext';
import { AuthProvider } from './context/AuthContext';
import { PartyProvider } from './context/PartyContext';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <PartyProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </PartyProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
