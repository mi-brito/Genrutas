import React from 'react';
import { OptiRutasLogo, DocumentTextIcon } from './icons';

interface HeaderProps {
  onShowReport: () => void;
}

const Header: React.FC<HeaderProps> = ({ onShowReport }) => {
  return (
    <header className="bg-white shadow-sm">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center">
            <OptiRutasLogo className="h-10 w-10 text-primary" />
            <div className="ml-3">
                <h1 className="text-2xl font-bold text-text-main tracking-tight">GenRutas</h1>
                <p className="text-xs text-text-light">Pumabús eléctrico y solar para Ciudad Universitaria</p>
            </div>
        </div>
         <button
            onClick={onShowReport}
            className="flex items-center py-2 px-3 border border-secondary text-secondary rounded-md shadow-sm text-sm font-medium hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary transition-colors"
          >
            <DocumentTextIcon className="h-4 w-4 mr-2" />
            Ficha del Proyecto
        </button>
      </div>
    </header>
  );
};

export default Header;