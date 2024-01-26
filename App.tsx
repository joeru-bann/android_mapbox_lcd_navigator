import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Button, TouchableOpacity, Image, Dimensions, Keyboard, PermissionsAndroid, Platform, FlatList  } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import MapViewDirections from 'react-native-maps-directions';
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions';

const { width: screenWidth } = Dimensions.get('window');
const MAPBOX_ACCESS_TOKEN = 'pk.eyJ1Ijoiam9lcnUiLCJhIjoiY2xyOXN6aGswMDZuaTJpcnNkdTN5Y3dtNyJ9.9hNeXSbKdMl5CXqRbVRYwQ'
const GOOGLE_MAPS_API_KEY = 'AIzaSyBSLHFzNpmj7x5NImV6SV6JcERThBaBqvo'; 
const API_BASE_URL = 'https://api.mapbox.com/geocoding/v5/mapbox.places/'
const GOOGLE_DIRECTIONS_API = 'https://maps.googleapis.com/maps/api/directions/json';

import MapView, {PROVIDER_GOOGLE, Polyline, Marker, MapCalloutSubview } from 'react-native-maps';
import {enableLatestRenderer} from 'react-native-maps';
import {BleManager, BleError, Device } from 'react-native-ble-plx';
import BluetoothStateManager from 'react-native-bluetooth-state-manager';

//import MapboxDirectionsFactory from '@mapbox/mapbox-sdk/services/directions';

// const Googletokenpath = '/tokens/gg_priv.txt';
//  const Mapboxtokenpath = '/tokens/mb_public.txt';

enableLatestRenderer();

const pathToLight = './icons/png/light/';

interface AddressFeature {
  place_name: string;
}

interface Step {
  maneuver: any;
  distance: any;
  html_instructions: string;
  instructions: string;
  start_location: { lat: number; lng: number };
  end_location: { lat: number; lng: number };
}

interface Leg {
  start_location: any;
  steps: Step[];
}

interface Route {
  legs: Leg[];
}

interface DirectionsResponse {
  routes: Route[];
}

const App: React.FC = () => { 

  const checkLocationPermission = async () => {
    try {
      const result = await check(
        Platform.OS === 'ios'
          ? PERMISSIONS.IOS.LOCATION_ALWAYS
          : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
      );
      
      if (result === RESULTS.GRANTED) {
        // Permission is already granted
        setLocationPermissionGranted(true);
        fetchUserLocation();
      } else {
        // Permission is not granted, request it
        const permissionResult = await request(
          Platform.OS === 'ios'
            ? PERMISSIONS.IOS.LOCATION_ALWAYS
            : PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
        );
        if (permissionResult === RESULTS.GRANTED) {
          // Permission granted after request
          setLocationPermissionGranted(true);
          fetchUserLocation();
        } else {
          // Permission denied, handle accordingly (e.g., show an error message)
          console.warn('Location permission denied.');
        }
      }
    } catch (error) {
      console.error('Error checking Bluetooth permissions:', error);
    }
  };

  const [locationPermissionGranted, setLocationPermissionGranted] = useState(false);

  const [destination, setDestination] = useState('');
  const [potentialAddresses, setPotentialAddresses] = useState<AddressFeature[]>([]);
  const [directions, setDirections] = useState<DirectionsResponse | null>(null);
  const [startingLocation, setStartingLocation] = useState('');
  const [navigationStarted, setNavigationStarted] = useState(false);

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [routeSteps, setRouteSteps] = useState<Step[]>([]);
  const [distanceToNextStep, setDistanceToNextStep] = useState<number | null>(null);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [displayedStepIndex, setDisplayedStepIndex] = useState(0);
  const [showAllDirections, setShowAllDirections] = useState(false);

  const [userLocation, setUserLocation] = useState(null);
  const [mapVisible, setMapVisible] = useState(false);
  const [currentLocation, setCurrentLocation] = useState({ latitude: 0, longitude: 0 });
  const [routeCoordinates, setRouteCoordinates] = useState<{ latitude: number; longitude: number }[]>([]);

  //for bte module
  const [devices, setDevices] = useState<Device[]>([]);
  const [device, setDevice] = useState<Device | null>(null); 
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [manager, setManager] = useState<BleManager | null>(null);


  const handleShowAllDirections = () => {
    setShowAllDirections((prevValue) => !prevValue);
  };

  const handleShowMap = () => {
    setMapVisible((prevValue) => !prevValue);
    Keyboard.dismiss(); //recess mobile keyboard by auto
  };

  useEffect(() => {
    checkLocationPermission();
    checkBluetoothPermissions();

  }, []);

  const checkBluetoothPermissions = async () => {
    // try {
    //   const result = await BluetoothStateManager.requestToEnable();
    //   if (result) {
    //     scanDevices();
    // console.log('bt enabled, scanning for devices)
    //   } else {
    //     console.warn('Bluetooth is not enabled.');
    //   }
    // } catch (error) {
    //   console.error('Error checking Bluetooth permissions:', error);
    // }
  };


  useEffect(() => {
    const bleManager = new BleManager();
    setManager(bleManager);

    if (navigationStarted) {
      const locationUpdateInterval = setInterval(() => {
        fetchUserLocation();
        updateRouteifClose();
      }, 80000);  // check user location + claculation delay
      return () => clearInterval(locationUpdateInterval);
    }
  }, [navigationStarted, currentStepIndex]);


  
  const scanDevices = async () => {
    try {
      const manager = new BleManager();

      const subscription = manager.onStateChange((state) => {
        if (state === 'PoweredOn') {
          manager.startDeviceScan(null, null, (error, scannedDevice) => {
            if (error) {
              console.error('Scan error:', error);
              return;
            }

            if (scannedDevice) {
              setDevices((prevDevices) => {
                if (!prevDevices.some((dev) => dev.id === scannedDevice.id)) {
                  return [...prevDevices, scannedDevice];
                }
                return prevDevices;
              });
            }
          });
            //bte scanning timeout limit
          setTimeout(() => {
            manager.stopDeviceScan();
          }, 30000);
        }
      }, true);

      return () => {
        subscription.remove();
        manager.destroy();
      };
    } catch (error) {
      console.error('Error scanning devices or Bluetooth not enabled:', error);
    }
  };

 
  const connectToDevice = async (manager: BleManager | null, selectedDevice: Device | null) => {
    try {
      if (manager && selectedDevice) {
        console.log('Connecting to device:', selectedDevice.name || selectedDevice.id)

        const connectedDevice = await selectedDevice.connect();
        setDevice(connectedDevice);
      } else {
        console.warn('No manager or device available for connection.');
      }
    } catch (error) {
      console.error('Error connecting to device:', error);
    }
  };

  const fetchUserLocation = () => {
    Geolocation.getCurrentPosition(
      position => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ latitude, longitude });
        reverseGeocode(latitude, longitude);
        console.log('User location: ' + latitude + ', ' + longitude)
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

  const fetchDirections = async () => {
    try {
      const currentLocation = encodeURIComponent(startingLocation); 
      const destinationLocation = encodeURIComponent(destination);


      const response = await fetch(
        `${GOOGLE_DIRECTIONS_API}?origin=${currentLocation}&destination=${destinationLocation}&key=${GOOGLE_MAPS_API_KEY}`
      );
  
      if (response.ok) {
        const data: DirectionsResponse = await response.json();
        setDirections(data);

        // extract all steps from the route
        const steps: Step[] = [];
        data.routes.forEach((route) => {
          route.legs.forEach((leg) => {
            steps.push(...leg.steps); 
          })
        });
          //printing steps for debugging
          data.routes.forEach((route, routeIndex) => {
            route.legs.forEach((leg, legIndex) => {
              leg.steps.forEach((step, stepIndex) => {
                console.log('Step Object:', step);
                console.log('Maneuver Type:', step.maneuver);

                sendNavigationalInstructions({
                  maneuver: step.maneuver || '',
                  roundaboutExit: '', // You may need to extract this information from step.instructions
                  arrowType: '', // You may need to extract this information from step.instructions
                  normalInstruction: step.instructions || '',
                });
                const maneuverString = step.maneuver ? step.maneuver.toString() : ''; // Convert to string if defined
                
              if (maneuverString && maneuverString.includes('roundabout')) {
                console.log('Roundabout included')
                const instructionString = step.html_instructions.toString()
                const match = instructionString.match(/(\d+)(st|nd|rd|th)/);
                const exitNumber = match ? match[1] : null;
                if (exitNumber !== null) {
                  console.log('Exit Number:', exitNumber);
                }
                else{
                  console.log('No exit number included')
                }


              }
              else{
                console.log('No roundabout included')
              }

              });
            });
          });

          setRouteSteps(steps);
          setNavigationStarted(true); // start live updates
        } else {
          console.error('Error fetching directions:', response.status);
        }
      } catch (error) {
        console.error('Error fetching directions:', error);
      }
    };

    const sendNavigationalInstructions = (instructions: {}) => {
      if (device && manager) {
        try {
          // Convert the instructions to a string or another suitable format
          const instructionsString = JSON.stringify(instructions);
    
          // Send the instructions to the Arduino via Bluetooth
          device.writeCharacteristicWithResponseForService(
            'YourServiceUUID',
            'YourCharacteristicUUID',
            instructionsString
          );
    
          console.log('Navigational instructions sent successfully:', instructionsString);
        } catch (error) {
          console.error('Error sending navigational instructions:', error);
        }
      } else {
        console.warn('Device or manager not available for sending instructions.');
      }
    };
  

    const updateRouteifClose = () => {
      if (navigationStarted && routeSteps.length > 0) {
        const nextStep = routeSteps[currentStepIndex];

        const calculatedDistanceToNextStep = calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          nextStep.start_location.lat,
          nextStep.start_location.lng
        );    

        if (calculatedDistanceToNextStep < 60) { //metres threshold for update directions
          if (!completedSteps.includes(currentStepIndex)) {
            sendNavigationalInstructions(currentStepIndex);
            setCompletedSteps([...completedSteps, currentStepIndex]);
            setDisplayedStepIndex((prevIndex) => prevIndex + 1);
            console.log('Completed Steps:', completedSteps);
    
            if (currentStepIndex + 1 === routeSteps.length) {
              setNavigationStarted(false); //end of trip
            }
          }
    
          if (currentStepIndex + 1 < routeSteps.length) {
            setCurrentStepIndex((prevIndex) => prevIndex + 1);
          }
        }
    
        setDistanceToNextStep(calculatedDistanceToNextStep);
      }
    };


  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c; // Distance in km

    return distance * 1000; // Convert to meters
  };

  const deg2rad = (deg: number) => {
    return deg * (Math.PI / 180);
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

  const [instructionIcons, setInstructionIcons] = useState<{ [key: string]: any }>({
    'undefined': require('./icons/png/light/direction_turn_straight.png'),
    'turn-left': require('./icons/png/light/direction_turn_left.png'),
    'turn-right': require('./icons/png/light/direction_turn_right.png'),
    'turn-slight-left': require('./icons/png/light/direction_turn_slight_left.png'),
    'turn-slight-right': require('./icons/png/light/direction_turn_slight_right.png'),
    'turn-sharp-left': require('./icons/png/light/direction_turn_sharp_left.png'),
    'turn-sharp-right': require('./icons/png/light/direction_turn_sharp_right.png'),
    'straight': require('./icons/png/light/direction_turn_straight.png'),
    'keep-left': require('./icons/png/light/direction_fork_slight_left.png'),
    'keep-right': require('./icons/png/light/direction_fork_slight_right.png'),
    'uturn-left': require('./icons/png/light/direction_uturn_left.png'),
    'uturn-right': require('./icons/png/light/direction_uturn_right.png'),
    'merge': require('./icons/png/light/direction_merge_right.png'),
    'ramp-left': require('./icons/png/light/direction_turn_left.png'),
    'ramp-right': require('./icons/png/light/direction_turn_right.png'),
    'fork-left': require('./icons/png/light/direction_fork_left.png'),
    'fork-right': require('./icons/png/light/direction_fork_right.png'),

    'roundabout-left': require('./icons/png/light/direction_rotary_left.png'),
    'roundabout-right': require('./icons/png/light/direction_rotary_right.png'),
    'roundabout-continue': require('./icons/png/light/direction_roundabout_straight.png'),
  });

        //main styling & UI sections
 return (
  <View style={styles.container}>
   <Text style={styles.header}>Halo Vision</Text>

      <TextInput //from field
        placeholder="Current Location"
        style={styles.input}
        value={startingLocation}
        onChangeText={text => setStartingLocation(text)}
      />
      <TextInput  //destination field
        style={styles.input}
        placeholder="Destination" 
        value={destination}
        onChangeText={handleDestinationChange}
      />

      {potentialAddresses.length > 0 && (
        <ScrollView style={styles.addressesContainer}>
          {potentialAddresses.map((address, index) => ( //address auto fill
            <TouchableOpacity
              key={index}
              onPress={() => handleAddressSelect(address.place_name)}
            >
              <Text style={styles.addressText}>{address.place_name || ''}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <TouchableOpacity onPress={() => connectToDevice(manager, selectedDevice)}>
        <Text style={{ color: 'white',
          marginTop: 3,
          padding: 4,
          backgroundColor: 'olivedrab',
          textAlign: 'center',}}> {'Connect to selected device'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={fetchDirections}>
        <Text style={{ color: 'white',
          marginTop: 3,
          padding: 4,
          backgroundColor: 'cornflowerblue',
          textAlign: 'center',}}> {'Get directions'}
        </Text>
      </TouchableOpacity>
 
    <View>
      <FlatList
        data={devices}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => setSelectedDevice(item)}>
            <Text>{item.name || 'Unnamed Device'}</Text>
          </TouchableOpacity>
        )}
      />   
      </View>


      {directions && displayedStepIndex < routeSteps.length && (     //solo step shown
        <View style={styles.currentStepContainer}>
          <View style={styles.directionsIcon}>
            {instructionIcons[directions.routes[0].legs[0].steps[displayedStepIndex].maneuver] ? (

              <Image source={instructionIcons[directions.routes[0].legs[0].steps[displayedStepIndex].maneuver]} style={{ width: 30, height: 30 }} /> //single maneuver image displayed
            ) : null}
          </View>
          <Text style={styles.directionsText}>
            {`${displayedStepIndex + 1}. ${
              displayedStepIndex > 0
                ? `In ${formatDistance(
                    directions.routes[0].legs[0].steps[displayedStepIndex - 1].distance.text,
                    directions.routes[0].legs[0].steps[displayedStepIndex - 1].distance.unit
                  )}, `
                : ''
            }${removeHtmlTags(
              directions.routes[0].legs[0].steps[displayedStepIndex].html_instructions ||
                directions.routes[0].legs[0].steps[displayedStepIndex].instructions ||
                ''
            )}`}
          </Text>
          
        </View>
      )}

  <TouchableOpacity onPress={handleShowAllDirections}>
        <Text style={styles.showAllDirectionsButton}>
          {showAllDirections ? 'Hide All Directions' : 'Show All Directions'}
        </Text>
      </TouchableOpacity>
    
      {!mapVisible ? (
        <TouchableOpacity onPress={handleShowMap}>
          <Text style={styles.hideMapButton}>Hide Map</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={handleShowMap}>
          <Text style={styles.showMapButton}>Show Map</Text>
        </TouchableOpacity>
      )}
     
        
     {!mapVisible && directions && (
        <MapView
        style={{ flex: 1 }}
        initialRegion={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: 0.01, 
          longitudeDelta: 0.01,
        }}
      >
          {/* Render the route using MapViewDirections */}
          <MapViewDirections
            origin={currentLocation}
            destination={destination}
            apikey={GOOGLE_MAPS_API_KEY}
            strokeWidth={3}
            strokeColor="red"
          />
          {/* Render markers at each step along the route */}
          {directions.routes[0]?.legs[0]?.steps?.map((step, index) => (
            <Marker
              key={index}
              coordinate={{
                latitude: step.start_location.lat,
                longitude: step.start_location.lng,
              }}
              title={`Step ${index + 1}`}
            />
          ))}
        </MapView>
      )}
       
        <View>
      </View>

    {directions && (showAllDirections || displayedStepIndex === routeSteps.length - 1) && ( //all steps shown
        <ScrollView style={styles.directionsContainer}>
          {directions.routes.map((route, routeIndex) => (
            <View key={routeIndex}>
              {route.legs.map((leg, legIndex) => (
                <View key={legIndex}>
                  {leg.steps.map((step, stepIndex) => (
                    <View
                      key={stepIndex}
                      style={[ 
                        styles.directionsRow, completedSteps.includes(currentStepIndex + stepIndex) && styles.completedStep,]}>
                      <View style={styles.directionsIcon}>
                        {instructionIcons[step.maneuver] ? (
                          <Image source={instructionIcons[step.maneuver]} style={{ width: 30, height: 30 }} /> //maneuver image 
                        ) : null}
                      </View>
                      <Text style={[styles.directionsText, { color: 'white', maxWidth: screenWidth - 60 }]}>
                        {`${stepIndex + 1}. ${
                          stepIndex > 0
                            ? `In ${formatDistance(
                                leg.steps[stepIndex - 1].distance.text,
                                leg.steps[stepIndex - 1].distance.unit
                              )}, `
                            : ''
                        }${removeHtmlTags(step?.html_instructions || step?.instructions || '')}`}
                      </Text>
                    </View>
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
  directionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  
  directionsIcon: {
    marginRight: 3,
  },
  directionsText: {
    marginBottom: 5,
    overflow: 'hidden',
    fontWeight: 'bold',
    color: 'white', 
  },
  currentStepContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  distanceText: {
    marginTop: 10,
    fontSize: 16,
    color: 'white',
  },
  completedStep: {
    backgroundColor: 'green', 
  },
  testButton: {
    color: 'white',
    marginTop: 10,
    padding: 10,
    backgroundColor: 'blue',
    textAlign: 'center',
  },
  showAllDirectionsButton: {
    color: 'white',
    marginTop: 5,
    padding: 7,
    backgroundColor: 'rebeccapurple',
    textAlign: 'center',
  },
  hideMapButton: {
    color: 'white',
    marginTop: 5,
    padding: 7,
    backgroundColor: 'darkred',
    textAlign: 'center',
  },
  showMapButton: {
    color: 'white',
    marginTop: 5,
    padding: 7,
    backgroundColor: 'green',
    textAlign: 'center',
  },
  map: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 5,
    backgroundColor: '#222', // dark
    color: 'white', 
  },
  input: {
    color: 'white',
    borderWidth: 2,
    borderColor: '#000',
    padding: 6,
    marginBottom: 3,
  },
  directionsContainer: {
    flex: 1,
    marginTop: 10,
  },
  header: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: 'white', 
  },
  addressesContainer: {
    maxHeight: 150,
    marginBottom: 10,
    color: 'white',
  },
  addressText: {
    borderWidth: 1,
    borderColor: 'white',
    padding: 10,
    marginBottom: 5,
    color: 'white',
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
function readFileSync(arg0: string, arg1: string) {
  throw new Error('Function not implemented.');
}

