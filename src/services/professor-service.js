import { API } from '../api';

class ProfessorReservationService {
  /**
   * Get all reservations for the current professor
   */
  async getProfessorReservations() {
    try {
      // Try multiple approaches to fetch the reservations
      let response;
      
      try {
        // First try the primary endpoint
        response = await API.professorAPI.getProfessorReservations();
      } catch (primaryError) {
        console.error("Primary endpoint failed:", primaryError);
        
        try {
          // Then try the alternative endpoint
          response = await API.professorAPI.getMyReservations();
        } catch (alternativeError) {
          console.error("Alternative endpoint failed:", alternativeError);
          
          // As a last resort, try a direct endpoint call
          response = await API.get('/api/professor/reservations');
        }
      }
      
      return this.formatReservations(response.data);
    } catch (error) {
      console.error('Error fetching professor reservations:', error);
      
      // Try to get data from local storage as last resort
      const storedReservations = localStorage.getItem('professorReservations');
      if (storedReservations) {
        console.log('Using stored reservations as fallback');
        return this.formatReservations(JSON.parse(storedReservations));
      }
      
      throw error;
    }
  }

  /**
   * Find available classrooms based on criteria
   */
  async findAvailableClassrooms(date, startTime, endTime, classType, capacity) {
    try {
      const searchCriteria = {
        date,
        startTime,
        endTime,
        classType,
        capacity: capacity || 0
      };
      
      const response = await API.professorAPI.searchAvailableClassrooms(searchCriteria);
      return response.data;
    } catch (error) {
      console.error('Error searching for available classrooms:', error);
      throw error;
    }
  }

  /**
   * Create a new reservation request
   */
  async createReservationRequest(requestData) {
    try {
      const response = await API.professorAPI.requestReservation(requestData);
      return response.data;
    } catch (error) {
      console.error('Error creating reservation request:', error);
      throw error;
    }
  }

  /**
   * Update an existing reservation
   * This is a new method specifically for updates
   */
  async updateReservationRequest(id, requestData) {
    try {
      // First try a direct PUT endpoint if it exists
      try {
        const response = await API.put(`/api/professor/reservations/${id}`, requestData);
        return response.data;
      } catch (directUpdateError) {
        console.error('Direct update failed, trying alternative approach:', directUpdateError);
        
        // If direct update fails, use a two-step approach:
        // 1. Cancel the existing reservation
        await this.cancelReservation(id);
        
        // 2. Create a new reservation with the updated data
        const createResponse = await this.createReservationRequest(requestData);
        return createResponse;
      }
    } catch (error) {
      console.error('Error updating reservation:', error);
      throw error;
    }
  }

  /**
   * Cancel a reservation
   */
  async cancelReservation(reservationId) {
    try {
      // First try the API method
      try {
        const response = await API.professorAPI.cancelReservation(reservationId);
        return response.data;
      } catch (apiError) {
        console.error('API method failed, trying direct endpoint:', apiError);
        
        // If that fails, try direct API call
        const response = await API.put(`/api/professor/reservations/${reservationId}/cancel`);
        return response.data;
      }
    } catch (error) {
      console.error('Error cancelling reservation:', error);
      throw error;
    }
  }

  /**
   * Format reservations data for consistency
   */
  formatReservations(reservations) {
    if (!Array.isArray(reservations)) {
      console.error('Expected array of reservations but got:', typeof reservations);
      return [];
    }
    
    return reservations.map(reservation => ({
      id: reservation.id || '',
      classroom: reservation.classroom || reservation.roomNumber || '',
      date: reservation.date || '',
      time: reservation.time || `${reservation.startTime || ''} - ${reservation.endTime || ''}`,
      startTime: reservation.startTime || '',
      endTime: reservation.endTime || '',
      purpose: reservation.purpose || '',
      status: reservation.status || 'PENDING',
      reservedBy: reservation.reservedBy || reservation.userName || ''
    }));
  }
}

export default new ProfessorReservationService();