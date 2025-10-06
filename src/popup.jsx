import React from 'react';
import ReactDOM from 'react-dom/client';
import VideoController from './components/VideoController';
import './styles.css';

const App = () => {
  return (
    <div className="app">
      <VideoController />
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
