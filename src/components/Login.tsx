import React, { useState, useEffect, useRef } from 'react';
import { User, authenticateUser } from '../services/database';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  console.log('[DEBUG] Login component mounted, onLogin callback:', typeof onLogin);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('');
  const [showDoctorVerification, setShowDoctorVerification] = useState(false);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState('');
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Reset form on component mount to clear any previous state
  useEffect(() => {
    setCode('');
    setError('');
    setConnectionStatus('');
    setSecurityAnswer('');
    setShowDoctorVerification(false);
    setPendingUser(null);
    setIsLoading(false);
  }, []);

  // Focus the hidden input for keyboard capture
  useEffect(() => {
    if (!showDoctorVerification && hiddenInputRef.current) {
      hiddenInputRef.current.focus();
    }
  }, [showDoctorVerification]);

  // Handle keyboard input
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showDoctorVerification || isLoading) return;

    const key = e.key;
    
    // Handle number keys (0-9)
    if (/^[0-9]$/.test(key) && code.length < 4) {
      setCode(code + key);
      setError('');
    }
    // Handle backspace
    else if (key === 'Backspace') {
      setCode(code.slice(0, -1));
      setError('');
    }
    // Handle Enter to submit
    else if (key === 'Enter' && code.length === 4) {
      handleLogin(e as any);
    }
    // Handle Escape or Delete to clear
    else if (key === 'Escape' || key === 'Delete') {
      setCode('');
      setError('');
    }

    e.preventDefault();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (code.length !== 4) {
      setError('Le code doit contenir 4 chiffres');
      return;
    }

    setIsLoading(true);
    setError('');
    setConnectionStatus('Test de la connexion à la base de données...');

    try {
      console.log('[DEBUG] Calling authenticateUser with code:', code);
      const user = await authenticateUser(code);
      
      console.log('[DEBUG] Authentication successful, user object:', JSON.stringify(user, null, 2));
      setConnectionStatus('Connexion à la base de données réussie !');
      
      // Check if user is a doctor - require additional verification
      if (user.role === 'doctor') {
        console.log('[DEBUG] Doctor detected, showing security verification');
        setPendingUser(user);
        setShowDoctorVerification(true);
        setCode(''); // Clear the code for security
      } else {
        // For reception/assistant, login directly
        console.log('[DEBUG] Non-doctor user, logging in directly:', user);
        setTimeout(() => {
          setConnectionStatus('');
          console.log('[DEBUG] Calling onLogin for non-doctor user');
          onLogin(user);
        }, 1000); // Show success message briefly
      }
    } catch (error) {
      console.error('[ERROR] Authentication error in frontend:', error);
      setConnectionStatus('');
      
      // Properly extract error message
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else {
        errorMessage = 'Code invalide';
      }
      
      // Provide more specific error messages
      if (errorMessage.includes('base de données')) {
        setError('Erreur de connexion à la base de données. Vérifiez votre réseau.');
      } else {
        setError(errorMessage || 'Code invalide');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDoctorVerification = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!pendingUser) return;
    
    setIsLoading(true);
    setError('');

    // Security questions/challenges for doctor verification
    const correctAnswers = [
      'chahelali@'
    ];
    
    const answerLower = securityAnswer.toLowerCase().trim();
    
    if (correctAnswers.includes(answerLower)) {
      // Correct answer - allow login immediately
      console.log('[DEBUG] Doctor verification successful, calling onLogin with:', pendingUser);
      onLogin(pendingUser);
    } else {
      setError('Réponse de sécurité incorrecte');
      setIsLoading(false);
    }
  };

  const resetLogin = () => {
    setShowDoctorVerification(false);
    setPendingUser(null);
    setSecurityAnswer('');
    setCode('');
    setError('');
    setConnectionStatus('');
  };

  const handleNumberClick = (number: string) => {
    if (code.length < 4) {
      setCode(code + number);
    }
  };

  const handleClear = () => {
    setCode('');
    setError('');
  };

  const handleBackspace = () => {
    setCode(code.slice(0, -1));
    setError('');
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#ffffff',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px'
    }}>
      <div style={{
        background: '#ffffff',
        borderRadius: '8px',
        padding: '40px',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        border: '1px solid #e2e8f0',
        maxWidth: '400px',
        width: '100%',
        textAlign: 'center' as const
      }}>
        {!showDoctorVerification ? (
          <>
            <div style={{ marginBottom: '30px' }}>
              <h1 style={{
                fontSize: '24px',
                fontWeight: '600',
                color: '#333333',
                marginBottom: '8px'
              }}>Centre Dentaire</h1>
              <p style={{
                color: '#666666',
                fontSize: '16px',
                marginBottom: '4px'
              }}>Code d'accès</p>
              <p style={{
                color: '#999999',
                fontSize: '12px',
                fontStyle: 'italic'
              }}>Utilisez les boutons ou tapez sur le clavier</p>
            </div>

            <form onSubmit={handleLogin}>
              {/* Hidden input for keyboard capture */}
              <input
                ref={hiddenInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={code}
                onChange={() => {}} // Controlled by keyboard handler
                onKeyDown={handleKeyDown}
                style={{
                  position: 'absolute',
                  left: '-9999px',
                  opacity: 0,
                  pointerEvents: 'none'
                }}
                autoComplete="off"
                autoFocus
              />
              
              <div 
                style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '15px',
                  marginBottom: '20px',
                  cursor: 'pointer'
                }}
                onClick={() => hiddenInputRef.current?.focus()}
              >
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      background: index < code.length ? '#333333' : '#f0f0f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontSize: '12px'
                    }}
                  >
                    {index < code.length ? '●' : ''}
                  </div>
                ))}
              </div>

              {connectionStatus && (
                <div style={{
                  background: '#f8f9fa',
                  color: '#333333',
                  padding: '10px',
                  borderRadius: '4px',
                  marginBottom: '20px',
                  fontSize: '14px',
                  textAlign: 'center',
                  border: '1px solid #e9ecef'
                }}>
                  {connectionStatus}
                </div>
              )}

              {error && (
                <div style={{
                  background: '#fed7d7',
                  color: '#c53030',
                  padding: '10px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '15px',
                marginBottom: '30px'
              }}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
                  <button
                    key={number}
                    type="button"
                    onClick={() => handleNumberClick(number.toString())}
                    disabled={isLoading}
                    style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      background: 'white',
                      fontSize: '18px',
                      fontWeight: '500',
                      color: '#333333',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {number}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={isLoading}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    fontSize: '12px',
                    fontWeight: '500',
                    color: '#666666',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  CLR
                </button>
                <button
                  type="button"
                  onClick={() => handleNumberClick('0')}
                  disabled={isLoading}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    fontSize: '18px',
                    fontWeight: '500',
                    color: '#333333',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleBackspace}
                  disabled={isLoading}
                  style={{
                    width: '60px',
                    height: '60px',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    fontSize: '16px',
                    fontWeight: '500',
                    color: '#666666',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  ⌫
                </button>
              </div>

              <button
                type="submit"
                disabled={code.length !== 4 || isLoading}
                style={{
                  width: '100%',
                  padding: '15px',
                  borderRadius: '4px',
                  border: 'none',
                  background: code.length === 4 && !isLoading ? '#333333' : '#e2e8f0',
                  color: code.length === 4 && !isLoading ? 'white' : '#999999',
                  fontSize: '16px',
                  fontWeight: '500',
                  cursor: code.length === 4 && !isLoading ? 'pointer' : 'not-allowed'
                }}
              >
                {isLoading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </>
        ) : (
          /* Doctor Security Verification */
          <div>
            <div style={{ marginBottom: '30px' }}>
              <h1 style={{
                fontSize: '22px',
                fontWeight: '600',
                color: '#333333',
                marginBottom: '8px'
              }}>Vérification de Sécurité</h1>
              <p style={{
                color: '#666666',
                fontSize: '14px'
              }}>Authentification supplémentaire requise</p>
            </div>

            <form onSubmit={handleDoctorVerification}>
              <div style={{ marginBottom: '20px', textAlign: 'left' as const }}>
                <label style={{
                  display: 'block',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#4a5568',
                  marginBottom: '8px'
                }}>
                  ...
                </label>
            
                <input
                  type="password"
                  value={securityAnswer}
                  onChange={(e) => setSecurityAnswer(e.target.value)}
                  placeholder="Votre réponse..."
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '4px',
                    fontSize: '14px',
                    outline: 'none'
                  }}
                  required
                />
              </div>

              {error && (
                <div style={{
                  background: '#fed7d7',
                  color: '#c53030',
                  padding: '10px',
                  borderRadius: '8px',
                  marginBottom: '20px',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{
                display: 'flex',
                gap: '10px',
                justifyContent: 'center'
              }}>
                <button
                  type="button"
                  onClick={resetLogin}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '4px',
                    border: '1px solid #e2e8f0',
                    background: 'white',
                    color: '#666666',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Retour
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !securityAnswer.trim()}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '4px',
                    border: 'none',
                    background: securityAnswer.trim() && !isLoading ? '#333333' : '#e2e8f0',
                    color: securityAnswer.trim() && !isLoading ? 'white' : '#999999',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: securityAnswer.trim() && !isLoading ? 'pointer' : 'not-allowed'
                  }}
                >
                  {isLoading ? 'Vérification...' : 'Vérifier'}
                </button>
              </div>
            </form>


          </div>
        )}
      </div>
    </div>
  );
};

export default Login;