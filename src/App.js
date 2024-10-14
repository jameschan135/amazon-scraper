import React, { useState } from 'react';
import AmazonScraperTab from './components/AmazonScraperTab';
import AmazonScraperTabMultiple from './components/AmazonScraperTabMultiple';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('single');

  return (
    <div className="App">
      <h1>Amazon Scraper</h1>
      <div className="tab-buttons">
        <button 
          onClick={() => setActiveTab('single')} 
          className={`tab-button ${activeTab === 'single' ? 'active' : ''}`}
        >
          Single ASIN
        </button>
        <button 
          onClick={() => setActiveTab('multiple')} 
          className={`tab-button ${activeTab === 'multiple' ? 'active' : ''}`}
        >
          Multiple ASINs
        </button>
      </div>
      {activeTab === 'single' ? <AmazonScraperTab /> : <AmazonScraperTabMultiple />}
    </div>
  );
}

export default App;
