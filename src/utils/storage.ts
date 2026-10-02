// Simple storage utilities - now replaced by real SQLite database
// This file kept for compatibility

export const loadData = () => {
  // Return empty data since we now use real database
  return {
    patients: [],
    appointments: [],
  };
};

export const saveData = (data: any) => {
  // No-op since we now use real database
  console.log('Data save called (using database instead):', data);
};

export const restoreBackup = () => {
  console.log('Backup restore called (using database instead)');
  return null;
};

export const exportData = (): string => {
  return JSON.stringify({ message: 'Using database instead of local storage' });
};

export const importData = (jsonData: string) => {
  console.log('Data import called (using database instead):', jsonData);
  return { patients: [], appointments: [] };
};