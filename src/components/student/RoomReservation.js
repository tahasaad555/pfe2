import React, { useState, useEffect } from 'react';
import '../../styles/dashboard.css';
import API from '../../api';
import ReservationEmailService from '../../services/ReservationEmailService';
import { useAuth } from '../../contexts/AuthContext'; // Import the auth context
import { useLocation, useNavigate } from 'react-router-dom';

function RoomReservation({ fullPage = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const isEditMode = queryParams.get('edit') === 'true';
  
  const [formData, setFormData] = useState({
    id: '',
    date: '',
    startTime: '',
    endTime: '',
    purpose: '',
    notes: '',
    isEdit: false // Flag for edit mode
  });
  const [searchResults, setSearchResults] = useState([]);
  const [allStudyRooms, setAllStudyRooms] = useState([]);
  const [selectedStudyRoom, setSelectedStudyRoom] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [viewMode, setViewMode] = useState('all'); // 'all' or 'search'
  const [fetchError, setFetchError] = useState(null);
  const { currentUser } = useAuth(); // Get current user for authentication status

  // Load all study rooms when component mounts
  useEffect(() => {
    fetchAllStudyRooms();
    
    // Process any queued emails that couldn't be sent previously
    const processQueuedEmails = async () => {
      try {
        const result = await ReservationEmailService.processEmailQueue();
        if (result.success > 0) {
          console.log(`Processed ${result.success} queued emails`);
        }
      } catch (error) {
        console.error('Error processing email queue:', error);
      }
    };
    
    processQueuedEmails();
    
    // Check if we're in edit mode and load reservation data
    if (isEditMode) {
      loadReservationForEditing();
    }
  }, [isEditMode]);

  // Function to load reservation data for editing
  const loadReservationForEditing = () => {
    try {
      const editingReservation = localStorage.getItem('editingReservation');
      if (!editingReservation) {
        console.error('No reservation data found for editing');
        setMessage({ text: 'No reservation data found for editing', type: 'error' });
        return;
      }
      
      const reservationData = JSON.parse(editingReservation);
      console.log('Loaded reservation data for editing:', reservationData);
      
      // Set form data with the reservation values
      setFormData({
        id: reservationData.id || '',
        date: reservationData.date || '',
        startTime: reservationData.startTime || '',
        endTime: reservationData.endTime || '',
        purpose: reservationData.purpose || '',
        notes: reservationData.notes || '',
        roomId: reservationData.classroomId || '',
        isEdit: true // Flag this as an edit operation
      });
      
      // Set view mode to search to show the form
      setViewMode('search');
      
      // Find the study room from the stored information and set it as selected
      if (reservationData.classroomId) {
        // We'll set the selected study room when fetchAllStudyRooms completes
        // The effect that depends on allStudyRooms will handle this
      } else if (reservationData.classroom) {
        // If we only have the classroom name, we'll try to find it by name after loading
        console.log('Will search for study room by name:', reservationData.classroom);
      }
    } catch (error) {
      console.error('Error loading reservation data for editing:', error);
      setMessage({ text: 'Error loading reservation data for editing', type: 'error' });
    }
  };
  
  // Effect to set the selected study room after all rooms are loaded in edit mode
  useEffect(() => {
    if (isEditMode && allStudyRooms.length > 0) {
      const editingReservation = JSON.parse(localStorage.getItem('editingReservation') || '{}');
      
      // Try to find the study room either by ID or by name
      let studyRoom = null;
      
      if (editingReservation.classroomId) {
        studyRoom = allStudyRooms.find(r => r.id === editingReservation.classroomId);
      }
      
      if (!studyRoom && editingReservation.classroom) {
        studyRoom = allStudyRooms.find(r => 
          r.name === editingReservation.classroom
        );
      }
      
      if (studyRoom) {
        console.log('Found study room for editing:', studyRoom);
        setSelectedStudyRoom(studyRoom);
        
        // Update the formData with the room ID if it wasn't set
        if (!formData.roomId) {
          setFormData(prev => ({
            ...prev,
            roomId: studyRoom.id
          }));
        }
      } else {
        console.warn('Could not find matching study room for editing');
      }
    }
  }, [allStudyRooms, isEditMode, formData.roomId]);

  // Create fallback methods if API is not properly defined
  useEffect(() => {
    if (!API.studentAPI) {
      console.error('studentAPI is undefined, creating fallback methods');
      // Create fallback methods
      API.studentAPI = {
        getStudyRooms: () => API.get('/api/student/study-rooms'),
        requestStudyRoomReservation: (roomId, data) => API.post('/api/student/study-room-reservations', {roomId, ...data}),
        updateStudyRoomReservation: (reservationId, data) => API.put(`/api/student/study-room-reservations/${reservationId}`, data),
        getMyReservations: () => API.get('/api/student/my-reservations'),
        cancelReservation: (reservationId) => API.put(`/api/student/reservations/${reservationId}/cancel`),
        searchAvailableStudyRooms: (criteria) => API.post('/api/student/study-rooms/search', criteria),
        // Other necessary methods...
      };
    }
  }, []);

  // Function to fetch all study rooms using the API service
  const fetchAllStudyRooms = async () => {
    setIsLoading(true);
    setFetchError(null);
    
    try {
      // Try multiple possible endpoints in case one fails
      let response;
      let studyRoomsData = [];
      
      try {
        // First try: studentAPI service
        response = await API.studentAPI.getStudyRooms();
        studyRoomsData = response.data;
        console.log('Successfully fetched study rooms from student API');
      } catch (err) {
        console.error('Error using student API endpoint:', err);
        
        try {
          // Second try: general rooms endpoint
          response = await API.get('/api/rooms/study-rooms', {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          studyRoomsData = response.data;
          console.log('Successfully fetched study rooms from general API');
        } catch (secondErr) {
          console.error('Error using general rooms endpoint:', secondErr);
          
          // Third try: public endpoint as last resort
          response = await API.get('/api/rooms/public-studyrooms');
          studyRoomsData = response.data;
          console.log('Successfully fetched study rooms from public API');
        }
      }
      
      console.log('Study rooms data fetched:', studyRoomsData);
      
      // If we made it here, we have some data
      if (studyRoomsData && Array.isArray(studyRoomsData)) {
        setAllStudyRooms(studyRoomsData);
        
        if (studyRoomsData.length === 0) {
          setMessage({ 
            text: 'Aucune salle d\'étude n\'est disponible actuellement.',
            type: 'warning' 
          });
        }
      } else {
        // Handle case when the data is not an array
        console.error('Received invalid data format:', studyRoomsData);
        throw new Error('Invalid data format received');
      }
      
    } catch (error) {
      console.error('Error fetching study rooms:', error);
      setFetchError(error.message || 'Une erreur est survenue lors du chargement des salles d\'étude');
      setMessage({ 
        text: 'Une erreur est survenue lors du chargement des salles d\'étude',
        type: 'error' 
      });
      
      // Fall back to mock data if everything fails
      const mockStudyRooms = [
        {
          id: 'SR001',
          name: 'Study Room 101',
          type: 'Group Study',
          capacity: 8,
          features: ['Whiteboard', 'Projector', 'Power Outlets'],
          availableTimes: '8AM - 9PM',
          image: '/images/study-room-default.jpg'
        },
        {
          id: 'SR002',
          name: 'Quiet Room 202',
          type: 'Individual Study',
          capacity: 4,
          features: ['Silent Area', 'Desk Lamps', 'Power Outlets'],
          availableTimes: '8AM - 10PM',
          image: '/images/study-room-default.jpg'
        },
        {
          id: 'SR003',
          name: 'Library Study Space',
          type: 'Open Area',
          capacity: 12,
          features: ['Large Tables', 'Natural Lighting', 'WiFi'],
          availableTimes: '9AM - 8PM',
          image: '/images/study-room-default.jpg'
        }
      ];
      
      setAllStudyRooms(mockStudyRooms);
      console.log('Using mock data due to API failure');
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }));
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage({ text: '', type: '' });
    setSearchResults([]);
    setSelectedStudyRoom(null);
    setSearchPerformed(true);
    setViewMode('search');

    try {
      // Validate inputs
      if (!formData.date || !formData.startTime || !formData.endTime) {
        setMessage({ text: 'Veuillez remplir tous les champs obligatoires', type: 'error' });
        setIsLoading(false);
        return;
      }

      // Create search request object
      const searchRequest = {
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime
      };
      
      console.log('Searching available study rooms with request:', searchRequest);
      
      try {
        // Try to use the API to search for rooms
        const response = await API.studentAPI.searchAvailableStudyRooms(searchRequest);
        setSearchResults(response.data);
      } catch (err) {
        console.error('Error using API search:', err);
        
        // For demo purposes, we'll filter the already loaded study rooms
        // In a real app, this would be a server-side API call
        const filteredRooms = allStudyRooms.filter(room => {
          // Simple filter - in real app this would be based on actual availability
          return true; // Return all rooms for now
        });
        
        setSearchResults(filteredRooms);
      }
      
      if (searchResults.length === 0) {
        setMessage({ text: 'Aucune salle d\'étude disponible ne correspond à vos critères', type: 'warning' });
      } else {
        setMessage({ text: `${searchResults.length} salles d'étude disponibles trouvées`, type: 'success' });
      }
    } catch (error) {
      console.error('Error searching study rooms:', error);
      setMessage({ text: 'Une erreur est survenue lors de la recherche: ' + (error.response?.data?.message || error.message), type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectStudyRoom = (studyRoom) => {
    setSelectedStudyRoom(studyRoom);
    
    // Update form with room ID
    setFormData(prev => ({
      ...prev,
      roomId: studyRoom.id
    }));
  };

  const handleSubmitReservation = async () => {
    if (!selectedStudyRoom && !formData.roomId) {
      setMessage({ text: 'Veuillez sélectionner une salle d\'étude', type: 'error' });
      return;
    }

    if (!formData.purpose) {
      setMessage({ text: 'Veuillez indiquer le motif de la réservation', type: 'error' });
      return;
    }

    if (!formData.date || !formData.startTime || !formData.endTime) {
      setMessage({ text: 'Veuillez spécifier la date et les heures de votre réservation', type: 'error' });
      return;
    }

    setIsLoading(true);
    setMessage({ text: '', type: '' });

    try {
      // Verify token is present
      const token = localStorage.getItem('token');
      if (!token) {
        console.error('No authentication token found');
        setMessage({ text: 'Vous devez être connecté pour effectuer cette action', type: 'error' });
        setTimeout(() => {
          window.location.href = '/';
        }, 2000);
        return;
      }

      // Create the request object in the format expected by the backend
      const requestBody = {
        roomId: formData.roomId || selectedStudyRoom.id,
        date: formData.date,
        startTime: formData.startTime,
        endTime: formData.endTime,
        purpose: formData.purpose,
        notes: formData.notes || ""
      };

      let response;
      
      // If we're editing an existing reservation, update it
      if (formData.isEdit && formData.id) {
        console.log('Updating existing reservation:', requestBody);
        
        try {
          // Try to use a direct PUT endpoint for updates
          response = await API.studentAPI.updateStudyRoomReservation(formData.id, requestBody);
          console.log('Update reservation success response:', response.data);
        } catch (updateErr) {
          console.error('Direct update failed, attempting alternative method:', updateErr);
          
          // If direct update fails, first cancel the existing reservation
          await API.studentAPI.cancelReservation(formData.id);
          console.log('Successfully cancelled old reservation before replacement');
          
          // Then create a new reservation with the updated details
          response = await API.studentAPI.requestStudyRoomReservation(requestBody.roomId, {
            date: requestBody.date,
            startTime: requestBody.startTime,
            endTime: requestBody.endTime,
            purpose: requestBody.purpose,
            notes: requestBody.notes
          });
          console.log('Created replacement reservation:', response.data);
        }
      } else {
        // For new reservations
        console.log('Sending study room reservation request:', requestBody);
        
        response = await API.studentAPI.requestStudyRoomReservation(requestBody.roomId, {
          date: formData.date,
          startTime: formData.startTime,
          endTime: formData.endTime,
          purpose: formData.purpose,
          notes: formData.notes || ""
        });
        
        console.log('Reservation success response:', response.data);
        
        // Send email notification to admin for new reservations only
        try {
          const reservationData = {
            id: response.data?.id || 'NEW_REQUEST',
            room: selectedStudyRoom.name,
            reservedBy: currentUser?.firstName + ' ' + currentUser?.lastName || 'Student',
            role: 'STUDENT',
            date: formData.date,
            time: `${formData.startTime} - ${formData.endTime}`,
            purpose: formData.purpose,
            notes: formData.notes || "",
            userEmail: currentUser?.email || ''
          };
          
          await ReservationEmailService.notifyAdminAboutNewRequest(reservationData);
          console.log('Admin notification email sent successfully');
        } catch (emailError) {
          console.error('Error sending admin notification email:', emailError);
          // Continue process even if email fails
        }
      }
      
      // Clean up localStorage if we were editing
      if (isEditMode) {
        localStorage.removeItem('editingReservation');
      }

      // Reset form and show success message
      setFormData({
        id: '',
        date: '',
        startTime: '',
        endTime: '',
        purpose: '',
        notes: '',
        isEdit: false
      });
      setSearchResults([]);
      setSelectedStudyRoom(null);
      setSearchPerformed(false);
      setViewMode('all');
      
      const actionType = isEditMode ? 'modifiée' : 'soumise';
      setMessage({ 
        text: `Votre demande de réservation de salle d\'étude a été ${actionType} avec succès et est en attente d\'approbation. Un email de confirmation vous sera envoyé une fois la demande traitée.`,
        type: 'success' 
      });
      
      // Redirect to My Reservations page after successful submission
      setTimeout(() => {
        navigate('/student/reservations');
      }, 3000);
    } catch (error) {
      console.error('Error submitting reservation:', error);
      
      if (error.response && error.response.status === 401) {
        // The interceptor will handle the redirect
        setMessage({ 
          text: 'Votre session a expiré. Vous allez être redirigé vers la page de connexion...', 
          type: 'error' 
        });
      } else {
        setMessage({ 
          text: error.response?.data?.message || error.message || 'Une erreur est survenue lors de la soumission de la demande',
          type: 'error' 
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Functions to change view
  const showAllStudyRooms = () => {
    setViewMode('all');
    setSearchPerformed(false);
    setSelectedStudyRoom(null);
  };

  const showSearchForm = () => {
    setViewMode('search');
  };

  // Function to refresh study rooms
  const handleRefresh = () => {
    fetchAllStudyRooms();
  };

  return (
    <div className={fullPage ? "main-content" : "reservation-form-container"}>
      {fullPage && (
        <div className="section-header">
          <h2>{isEditMode ? 'Modifier une réservation' : 'Réserver une salle d\'étude'}</h2>
          <p>{isEditMode ? 'Modifiez votre demande de réservation' : 'Recherchez et réservez une salle d\'étude adaptée à vos besoins'}</p>
        </div>
      )}
      
      {message.text && (
        <div className={`alert alert-${message.type}`}>
          {message.text}
        </div>
      )}
      
      <div className="view-toggle">
        <button 
          className={`tab-button ${viewMode === 'all' ? 'active' : ''}`}
          onClick={showAllStudyRooms}
        >
          Toutes les salles d'étude
        </button>
        <button 
          className={`tab-button ${viewMode === 'search' ? 'active' : ''}`}
          onClick={showSearchForm}
        >
          Recherche par horaire
        </button>
      </div>
      
      {viewMode === 'search' ? (
        <>
          <form id="reserve-studyroom-form" onSubmit={handleSearch}>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="reservation-date">Date <span className="required">*</span></label>
                <input 
                  type="date" 
                  id="reservation-date" 
                  name="date" 
                  value={formData.date}
                  onChange={handleChange}
                  required 
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
              <div className="form-group">
                <label htmlFor="start-time">Heure de début <span className="required">*</span></label>
                <input 
                  type="time" 
                  id="start-time" 
                  name="startTime" 
                  value={formData.startTime}
                  onChange={handleChange}
                  required 
                />
              </div>
              <div className="form-group">
                <label htmlFor="end-time">Heure de fin <span className="required">*</span></label>
                <input 
                  type="time" 
                  id="end-time" 
                  name="endTime" 
                  value={formData.endTime}
                  onChange={handleChange}
                  required 
                />
              </div>
            </div>
            
            <button type="submit" className="btn-primary" disabled={isLoading}>
              {isLoading ? 'Recherche en cours...' : 'Rechercher des salles d\'étude disponibles'}
            </button>
          </form>
          
          {searchPerformed && (
            <div className="search-results-container">
              <h3>Salles d'étude disponibles</h3>
              
              {searchResults.length === 0 ? (
                <p>Aucune salle d'étude disponible ne correspond à vos critères. Veuillez modifier vos critères de recherche.</p>
              ) : (
                <div className="study-room-grid classroom-grid">
                  {searchResults.map(studyRoom => (
                    <div 
                      key={studyRoom.id} 
                      className={`study-room-card ${selectedStudyRoom && selectedStudyRoom.id === studyRoom.id ? 'selected' : ''}`}
                      onClick={() => handleSelectStudyRoom(studyRoom)}
                    >
                      <div className="study-room-image">
                        <img 
                          src={studyRoom.image || '/images/study-room-default.jpg'} 
                          alt={studyRoom.name}
                          onError={(e) => {
                            e.target.onerror = null;
                            e.target.src = '/images/study-room-default.jpg';
                          }}
                        />
                      </div>
                      <h4>{studyRoom.name}</h4>
                      <p><strong>Type:</strong> {studyRoom.type}</p>
                      <p><strong>Capacité:</strong> {studyRoom.capacity} personnes</p>
                      {studyRoom.features && studyRoom.features.length > 0 && (
                        <div className="features">
                          <p><strong>Équipements:</strong></p>
                          <ul>
                            {Array.isArray(studyRoom.features) ? 
                              studyRoom.features.map((feature, index) => (
                                <li key={index}>{feature}</li>
                              )) : 
                              <li>{studyRoom.features.toString()}</li>
                            }
                          </ul>
                        </div>
                      )}
                      {studyRoom.availableTimes && (
                        <p><strong>Heures d'ouverture:</strong> {studyRoom.availableTimes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="all-study-rooms-container">
          <h3>
            Toutes les salles d'étude disponibles
            <button onClick={handleRefresh} className="refresh-button" disabled={isLoading}>
              {isLoading ? 'Chargement...' : '🔄 Rafraîchir'}
            </button>
          </h3>
          
          {isLoading ? (
            <p>Chargement des salles d'étude...</p>
          ) : allStudyRooms.length === 0 ? (
            <div>
              <p>Aucune salle d'étude disponible actuellement.</p>
              {fetchError && <p style={{color: 'red'}}>Erreur: {fetchError}</p>}
              <button onClick={handleRefresh} className="btn-secondary">Réessayer</button>
            </div>
          ) : (
            <div className="study-room-grid classroom-grid">
              {allStudyRooms.map(studyRoom => (
                <div 
                  key={studyRoom.id} 
                  className={`study-room-card ${selectedStudyRoom && selectedStudyRoom.id === studyRoom.id ? 'selected' : ''}`}
                  onClick={() => handleSelectStudyRoom(studyRoom)}
                >
                  <div className="study-room-image">
                    <img 
                      src={studyRoom.image || '/images/study-room-default.jpg'} 
                      alt={studyRoom.name}
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = '/images/study-room-default.jpg';
                      }}
                    />
                  </div>
                  <h4>{studyRoom.name}</h4>
                  <p><strong>Type:</strong> {studyRoom.type}</p>
                  <p><strong>Capacité:</strong> {studyRoom.capacity} personnes</p>
                  {studyRoom.features && studyRoom.features.length > 0 && (
                    <div className="features">
                      <p><strong>Équipements:</strong></p>
                      <ul>
                        {Array.isArray(studyRoom.features) ? 
                          studyRoom.features.map((feature, index) => (
                            <li key={index}>{feature}</li>
                          )) : 
                          <li>{studyRoom.features.toString()}</li>
                        }
                      </ul>
                    </div>
                  )}
                  {studyRoom.availableTimes && (
                    <p><strong>Heures d'ouverture:</strong> {studyRoom.availableTimes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {selectedStudyRoom && (
        <div className="reservation-details-container">
          <h3>{isEditMode ? 'Finaliser la modification' : 'Finaliser la réservation'}</h3>
          <div className="selected-study-room-info">
            <div className="selected-study-room-image">
              <img 
                src={selectedStudyRoom.image || '/images/study-room-default.jpg'} 
                alt={selectedStudyRoom.name}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = '/images/study-room-default.jpg';
                }}
              />
            </div>
            <h4>Salle d'étude sélectionnée: {selectedStudyRoom.name}</h4>
            <p>Type: {selectedStudyRoom.type} | Capacité: {selectedStudyRoom.capacity} personnes</p>
            {selectedStudyRoom.availableTimes && (
              <p>Heures d'ouverture: {selectedStudyRoom.availableTimes}</p>
            )}
          </div>
          
          <div className="form-group">
            <label htmlFor="reservation-date">Date <span className="required">*</span></label>
            <input 
              type="date" 
              id="reservation-date" 
              name="date" 
              value={formData.date}
              onChange={handleChange}
              required 
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="start-time">Heure de début <span className="required">*</span></label>
              <input 
                type="time" 
                id="start-time" 
                name="startTime" 
                value={formData.startTime}
                onChange={handleChange}
                required 
              />
            </div>
            <div className="form-group">
              <label htmlFor="end-time">Heure de fin <span className="required">*</span></label>
              <input 
                type="time" 
                id="end-time" 
                name="endTime" 
                value={formData.endTime}
                onChange={handleChange}
                required 
              />
            </div>
          </div>
          
          <div className="form-group">
            <label htmlFor="purpose">Motif de la réservation <span className="required">*</span></label>
            <input 
              type="text" 
              id="purpose" 
              name="purpose" 
              placeholder="ex: Étude en groupe, Révisions, Travail personnel..." 
              value={formData.purpose}
              onChange={handleChange}
              required 
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="additional-notes">Notes supplémentaires</label>
            <textarea 
              id="additional-notes" 
              name="notes" 
              rows="3"
              placeholder="Informations complémentaires..."
              value={formData.notes}
              onChange={handleChange}
            ></textarea>
          </div>
          
          <div className="form-info-box">
            <p><strong>Note:</strong> Une fois la demande soumise, un administrateur examinera votre demande. 
            Vous recevrez une notification par email dès que votre demande sera approuvée ou refusée.</p>
          </div>
          
          <button 
            type="button" 
            className="btn-primary" 
            onClick={handleSubmitReservation}
            disabled={isLoading || !formData.purpose || !formData.date || !formData.startTime || !formData.endTime}
          >
            {isLoading ? 'Soumission en cours...' : isEditMode ? 'Mettre à jour la réservation' : 'Soumettre la demande de réservation'}
          </button>
        </div>
      )}
    </div>
  );
}

export default RoomReservation;