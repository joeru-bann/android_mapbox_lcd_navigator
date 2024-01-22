import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Button, TouchableOpacity } from 'react-native';
import Geolocation from 'react-native-geolocation-service';

const GOOGLE_MAPS_API_KEY = 'AIzaSyBSLHFzNpmj7x5NImV6SV6JcERThBaBqvo'; 
const GOOGLE_DIRECTIONS_API = 'https://maps.googleapis.com/maps/api/directions/json';

const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1Ijoiam9lcnUiLCJhIjoiY2xyOXN6aGswMDZuaTJpcnNkdTN5Y3dtNyJ9.9hNeXSbKdMl5CXqRbVRYwQ'; 
const API_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'

interface AddressFeature {
  place_name: string;
}

interface Step {
  distance: any;
  html_instructions: string;
  instructions: string;
}

interface Leg {
  steps: Step[];
}

interface Route {
  legs: Leg[];
}

interface DirectionsResponse {
  routes: Route[];
}

const App: React.FC = () => {
  const [destination, setDestination] = useState('');
  const [potentialAddresses, setPotentialAddresses] = useState<AddressFeature[]>([]);
  const [directions, setDirections] = useState<DirectionsResponse | null>(null);
  const [startingLocation, setStartingLocation] = useState('');
  const [navigationStarted, setNavigationStarted] = useState(false);


  useEffect(() => {
    fetchUserLocation();
  }, []);

  const fetchUserLocation = () => {
    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        reverseGeocode(latitude, longitude);
      },
      error => {
        console.error('Error getting user location:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 10000 }
    );
  };

  const reverseGeocode = async (latitude: number, longitude: number) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}${longitude},${latitude}.json?access_token=${MAPBOX_ACCESS_TOKEN}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.features && data.features.length > 0) {
          const nearestAddress = (data.features[0] as AddressFeature).place_name || '';
          setStartingLocation(nearestAddress);
        }
      } else {
        console.error('Error fetching user location address:', response.status);
      }
    } catch (error) {
      console.error('Error fetching user location address:', error);
    }
  };

  const fetchPotentialAddresses = async () => {
    try {
      if (destination.length > 0) {
        const response = await fetch(
          `${API_BASE_URL}${encodeURIComponent(destination)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&country=NZ`
        );

        if (response.ok) {
          const data = await response.json();
          setPotentialAddresses(data.features || []);
        } else {
          console.error('Error fetching potential addresses:', response.status);
        }
      } else {
        setPotentialAddresses([]);
      }
    } catch (error) {
      console.error('Error fetching potential addresses:', error);
    }
  };
  
  const handleGetDirections = async () => {
    try {
      const currentLocation = encodeURIComponent(startingLocation); // Use current location as origin
      const destinationLocation = encodeURIComponent(destination);
  
      const response = await fetch(
        `${GOOGLE_DIRECTIONS_API}?origin=${currentLocation}&destination=${destinationLocation}&key=${GOOGLE_MAPS_API_KEY}`
      );
  
      if (response.ok) {
        const data: DirectionsResponse = await response.json();
        setDirections(data);
      } else {
        console.error('Error fetching directions:', response.status);
      }
    } catch (error) {
      console.error('Error fetching directions:', error);
    }
  };

  const handleDestinationChange = (text: string) => {
    setDestination(text);
    setNavigationStarted(false); // Reset navigation status when destination changes
    fetchPotentialAddresses();
  };

  const handleAddressSelect = (selectedAddress: string) => {
    setDestination(selectedAddress);
    setPotentialAddresses([]); // Clear address suggestions
  };

  const removeHtmlTags = (text: string) => {
    return text.replace(/<\/?[^>]+(>|$)/g, ''); // Regex to remove HTML tags
  };

  const formatDistance = (distance: string, unit: string) => {
    const distanceValue = parseFloat(distance);
    if (distanceValue < 1000) {
      return `${(distanceValue)*1000}m`;
    } else {
      const distanceInKm = distanceValue / 1000;
      return `${distanceInKm.toFixed(2)} km`;
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        placeholder="Current Location"
        style={styles.input}
        value={startingLocation}
        onChangeText={text => setStartingLocation(text)}
      />
      <TextInput
        placeholder="Destination"
        style={styles.input}
        value={destination}
        onChangeText={handleDestinationChange}
      />
      {potentialAddresses.length > 0 && (
        <ScrollView style={styles.addressesContainer}>
          {potentialAddresses.map((address, index) => (
            <TouchableOpacity
              key={index}
              onPress={() => handleAddressSelect(address.place_name)}
            >
              <Text style={styles.addressText}>{address.place_name || ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
      <Text style={styles.header}>balls8cker_locat0r33</Text>

      <Button title="Get Directions" onPress={handleGetDirections} />

      {directions && (
        <ScrollView style={styles.directionsContainer}>
          {directions.routes.map((route, routeIndex) => (
            <View key={routeIndex}>
              {route.legs.map((leg, legIndex) => (
                <View key={legIndex}>
                  {leg.steps.map((step, stepIndex) => (
                    <Text key={stepIndex} style={{ fontWeight: 'bold' }}>

                    {`${stepIndex + 1}. In ${formatDistance(step.distance.text, step.distance.unit)}, ${removeHtmlTags(step?.html_instructions || step?.instructions || '')}`}
                      
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  input: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    marginBottom: 10,
  },
  directionsContainer: {
    flex: 1,
    marginTop: 10,
  },
  directionsText: {
    marginBottom: 5,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  addressesContainer: {
    maxHeight: 150,
    marginBottom: 10,
  },
  addressText: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    marginBottom: 5,
  },
  directionInput: {
    borderWidth: 1,
    borderColor: '#000',
    padding: 10,
    marginBottom: 10,
    textAlignVertical: 'top',
  },
});

export default App;
