import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/app.css';
import App from './App';
import { NarrowScreenNotice } from './components/NarrowScreenNotice';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <NarrowScreenNotice />
  </StrictMode>,
);
