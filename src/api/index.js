// api/index.js
import axios from 'axios';

// Configure base URL for API requests
const API = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  // Enable CORS credentials
  withCredentials: true
});

console.log('API baseURL configured as:', API.defaults.baseURL);

// Add a response interceptor to handle token expiration
API.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;
    
    // If error is 401 Unauthorized and not already retrying
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      console.log("Authentication error detected - token expired or invalid");
      
      // Mark as retried to prevent infinite loops
      originalRequest._retry = true;
      
      // Check if it's a token validation error
      const isTokenError = error.response.data && 
                          (error.response.data.error === 'invalid_token' || 
                           error.response.data.message?.toLowerCase().includes('token') ||
                           error.response.data.message?.toLowerCase().includes('unauthorized'));
      
      // Clear authentication
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      
      // Add a timestamp to prevent immediate relogin issues
      sessionStorage.setItem('auth_error_timestamp', Date.now().toString());
      
      // Create enhanced error with more detailed information
      return Promise.reject({
        ...error,
        isAuthError: true,
        errorType: isTokenError ? 'token_error' : 'unauthorized',
        message: isTokenError 
          ? "Your authentication token has expired or is invalid. Please log in again." 
          : "Your session has expired. Please log in again.",
        timestamp: Date.now()
      });
    }
    
    // Handle network errors that might also be related to auth
    if (!error.response && error.request) {
      console.log("Network error detected - could be connectivity issue or server down");
      
      // Check if we have a token but getting network errors
      // This could indicate a server issue or blocked requests
      const token = localStorage.getItem('token');
      if (token) {
        console.log("Network error with existing token - could be server unavailable");
      }
    }
    
    return Promise.reject(error);
  }
);

// Add request interceptor to add JWT token to requests
API.interceptors.request.use(
  (config) => {
    // Get and validate token
    const token = localStorage.getItem('token');
    const isTokenValid = validateToken(token);
    
    console.log('Request to:', config.url, '- Token exists:', !!token, '- Token valid:', isTokenValid);
    
    if (token && isTokenValid) {
      // Add token to Authorization header
      config.headers['Authorization'] = `Bearer ${token}`;
      
      // Add request timestamp for potential request timeout detection
      config.metadata = { startTime: new Date().getTime() };
    } else if (token && !isTokenValid) {
      // If token exists but is invalid, remove it
      console.log('Invalid token detected, removing from localStorage');
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
    
    // Don't override Content-Type if it's multipart/form-data
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Basic token validation function
function validateToken(token) {
  if (!token) return false;
  
  try {
    // Check if token has valid JWT format (header.payload.signature)
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) return false;
    
    // Decode the middle part (payload)
    const payload = JSON.parse(atob(tokenParts[1]));
    
    // Check if token is expired
    const expiryTime = payload.exp * 1000; // Convert to milliseconds
    const currentTime = Date.now();
    
    if (expiryTime < currentTime) {
      console.log('Token expired at:', new Date(expiryTime).toISOString());
      console.log('Current time:', new Date(currentTime).toISOString());
      return false;
    }
    
    return true;
  } catch (e) {
    console.error('Error validating token:', e);
    return false;
  }
}

// Add response time tracking to all requests
API.interceptors.response.use(
  (response) => {
    // Calculate request duration if metadata exists
    if (response.config.metadata) {
      const endTime = new Date().getTime();
      const duration = endTime - response.config.metadata.startTime;
      console.log(`Request to ${response.config.url} took ${duration}ms`);
      
      // Warning for slow requests
      if (duration > 5000) {
        console.warn(`Slow request detected: ${response.config.url} took ${duration}ms`);
      }
    }
    return response;
  }
);

// Debug info
console.log('API module loading correctly');

// FIX: Correct profileAPI implementation
API.profileAPI = {
  getUserProfile: () => {
    // Check token before even attempting the request
    if (!localStorage.getItem('token')) {
      return Promise.reject({
        isAuthError: true,
        message: "No authentication token found. Please log in."
      });
    }
    
    // FIXED: Use the correct path WITHOUT duplicate /api prefix
    return API.get('/profile')
      .catch(error => {
        // Don't retry if it's an auth error
        if (error.isAuthError) {
          return Promise.reject(error);
        }
        
        console.log('First profile endpoint failed, trying alternatives...', error);
        
        // Try alternative endpoint paths
        return API.get('/users/profile')
          .catch(error2 => {
            // Don't retry if it's an auth error
            if (error2.isAuthError) {
              return Promise.reject(error2);
            }
            
            console.log('Second profile endpoint failed, trying a third option...');
            
            // Try direct axios call as a last resort
            return API.get('/api/profile')
              .catch(error3 => {
                console.log('All profile endpoints failed:', error3);
                return Promise.reject(error3);
              });
          });
      });
  },
  
  updateProfile: (profileData) => {
    // Check token before attempting the request
    if (!localStorage.getItem('token')) {
      return Promise.reject({
        isAuthError: true,
        message: "No authentication token found. Please log in."
      });
    }
    
    // FIXED: Use the correct path WITHOUT duplicate /api prefix
    return API.put('/profile', profileData)
      .catch(error => {
        if (error.isAuthError) {
          return Promise.reject(error);
        }
        
        console.log('Falling back to alternative profile update endpoint');
        return API.put('/users/profile', profileData);
      });
  },
  
  changePassword: (passwordData) => {
    // Check token before attempting the request
    if (!localStorage.getItem('token')) {
      return Promise.reject({
        isAuthError: true,
        message: "No authentication token found. Please log in."
      });
    }
    
    // FIXED: Use the correct path WITHOUT duplicate /api prefix
    return API.put('/profile/password', passwordData)
      .catch(error => {
        if (error.isAuthError) {
          return Promise.reject(error);
        }
        
        console.log('Falling back to alternative password change endpoint');
        return API.put('/users/change-password', passwordData);
      });
  },
  
  getUserInfo: () => {
    // Check token before attempting the request
    if (!localStorage.getItem('token')) {
      return Promise.reject({
        isAuthError: true,
        message: "No authentication token found. Please log in."
      });
    }
    
    // FIXED: Use the correct path WITHOUT duplicate /api prefix
    return API.get('/profile/user-info')
      .catch(error => {
        if (error.isAuthError) {
          return Promise.reject(error);
        }
        
        console.log('Falling back to alternative user info endpoint');
        return API.get('/users/profile/info');
      });
  }
};
// Add this to your api/index.js file

// File upload API calls
API.fileAPI = {
  // Upload profile with image
  uploadProfileWithImage: (formData) => {
    return API.post('/profile/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  },
  
  // Upload any image file
  uploadImage: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    
    return API.post('/uploads/images', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
  }
};
// FIX: Update timetableAPI to remove duplicate /api prefix
API.timetableAPI = {
  getMyTimetable: () => {
    // FIXED: Removed duplicate /api prefix
    return API.get('/timetable/my-timetable');
  },
  // Other timetable methods would be fixed similarly
};

// Export as default and named export for compatibility
export { API };
export default API;