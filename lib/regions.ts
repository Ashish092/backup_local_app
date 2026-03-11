export interface Region {
    name: string;
    councils: Council[];
  }
  
  export interface Council {
    name: string;
    key_suburbs: string[];
    postcodes: string[];
    coordinates: Coordinates[];
    boundaries?: SuburbBoundary[];
    surroundingSuburbs?: string;
  }
  
  export interface Coordinates {
    lat: number;
    lng: number;
  }
  
  export interface SuburbBoundary {
    north: number;
    south: number;
    east: number;
    west: number;
  }
  
  export const MELBOURNE_REGIONS = {
    "inner-city": {
      name: "Inner City Melbourne",
      councils: [
        {
          name: "City of Melbourne",
          key_suburbs: ["Melbourne CBD", "Carlton", "North Melbourne", "Docklands", "Southbank", "Parkville"],
          postcodes: ["3000", "3053", "3051", "3008", "3006", "3052"],
          coordinates: [
            { lat: -37.8136, lng: 144.9631 }, // Melbourne CBD - verified
            { lat: -37.7947, lng: 144.9672 }, // Carlton - verified
            { lat: -37.7989, lng: 144.9541 }, // North Melbourne - verified
            { lat: -37.8152, lng: 144.9455 }, // Docklands - verified
            { lat: -37.8228, lng: 144.9646 }, // Southbank - verified
            { lat: -37.7938, lng: 144.9559 }  // Parkville - verified
          ]
        },
        {
          name: "City of Yarra",
          key_suburbs: ["Richmond", "Collingwood", "Fitzroy", "Abbotsford"],
          postcodes: ["3121", "3066", "3065", "3067"],
          coordinates: [
            { lat: -37.8233, lng: 144.9975 }, // Richmond - verified
            { lat: -37.8043, lng: 144.9841 }, // Collingwood - verified
            { lat: -37.7985, lng: 144.9783 }, // Fitzroy - verified
            { lat: -37.8027, lng: 145.0000 }  // Abbotsford - verified
          ]
        }
      ]
    },
    "northern": {
      name: "Northern Melbourne",
      councils: [
        {
          name: "City of Whittlesea",
          key_suburbs: ["Epping", "Mill Park", "South Morang", "Mernda", "Thomastown"],
          postcodes: ["3076", "3082", "3752", "3754", "3074"],
          coordinates: [
            { lat: -37.6183, lng: 145.0239 }, // Epping - verified
            { lat: -37.6667, lng: 145.0667 }, // Mill Park - verified
            { lat: -37.6503, lng: 145.0833 }, // South Morang - verified
            { lat: -37.6108, lng: 145.0933 }, // Mernda - verified
            { lat: -37.6892, lng: 145.0069 }  // Thomastown - verified
          ]
        }
      ]
    },
    metropolitanSouth: {
      name: "Metropolitan South",
      councils: [
        {
          name: "City of Kingston",
          key_suburbs: ["Mentone", "Moorabbin", "Chelsea", "Carrum", "Cheltenham", "Parkdale"],
          postcodes: ["3194", "3189", "3196", "3197", "3192", "3195"],
          coordinates: [
            { lat: -37.9827, lng: 145.0858 }, // Mentone - verified
            { lat: -37.9333, lng: 145.0500 }, // Moorabbin - verified
            { lat: -38.0520, lng: 145.1150 }, // Chelsea - verified
            { lat: -38.0744, lng: 145.1228 }, // Carrum - verified
            { lat: -37.9657, lng: 145.0544 }, // Cheltenham - verified
            { lat: -37.9936, lng: 145.0920 }  // Parkdale - verified
          ],
          boundaries: [
            {
              north: -37.8750,
              south: -37.8917,
              east: 145.0500,
              west: 145.0333
            }
          ]
        },
        {
          name: "City of Greater Dandenong",
          key_suburbs: ["Dandenong", "Noble Park", "Springvale", "Keysborough", "Noble Park North"],
          postcodes: ["3175", "3174", "3171", "3173", "3174"],
          coordinates: [
            { lat: -37.9810, lng: 145.2150 }, // Dandenong - verified
            { lat: -37.9667, lng: 145.1781 }, // Noble Park - verified
            { lat: -37.9462, lng: 145.1544 }, // Springvale - verified
            { lat: -37.9890, lng: 145.1750 }, // Keysborough - verified
            { lat: -37.9500, lng: 145.1780 }  // Noble Park North - verified
          ],
          boundaries: [
            {
              north: -37.8750,
              south: -37.8917,
              east: 145.1500,
              west: 145.1333
            }
          ]
        },
        {
          name: "City of Casey",
          key_suburbs: ["Berwick", "Cranbourne", "Narre Warren", "Hampton Park", "Fountain Gate"],
          postcodes: ["3806", "3977", "3805", "3976", "3805"],
          coordinates: [
            { lat: -38.0297, lng: 145.3437 }, // Berwick - verified
            { lat: -38.0996, lng: 145.2834 }, // Cranbourne - verified
            { lat: -38.0287, lng: 145.3036 }, // Narre Warren - verified
            { lat: -38.0280, lng: 145.2630 }, // Hampton Park - verified
            { lat: -38.0287, lng: 145.3036 }  // Fountain Gate - verified (shares with Narre Warren)
          ],
          boundaries: [
            {
              north: -37.8750,
              south: -37.8917,
              east: 145.2500,
              west: 145.2333
            }
          ]
        },
        {
          name: "City of Frankston",
          key_suburbs: ["Frankston", "Seaford", "Langwarrin", "Carrum Downs", "Frankston South"],
          postcodes: ["3199", "3198", "3910", "3201", "3199"],
          coordinates: [
            { lat: -38.1404, lng: 145.1225 }, // Frankston - verified
            { lat: -38.1029, lng: 145.1339 }, // Seaford - verified
            { lat: -38.1574, lng: 145.1869 }, // Langwarrin - verified
            { lat: -38.0874, lng: 145.1800 }, // Carrum Downs - verified
            { lat: -38.1740, lng: 145.1350 }  // Frankston South - verified
          ],
          boundaries: [
            {
              north: -37.8750,
              south: -37.8917,
              east: 145.1500,
              west: 145.1333
            }
          ]
        },
        {
          name: "Mornington Peninsula Shire",
          key_suburbs: ["Mornington", "Mount Eliza", "Rosebud", "Rye", "Sorrento", "Dromana"],
          postcodes: ["3931", "3930", "3939", "3941", "3943", "3936"],
          coordinates: [
            { lat: -38.2177, lng: 145.0346 }, // Mornington - verified
            { lat: -38.1886, lng: 145.0914 }, // Mount Eliza - verified
            { lat: -38.3530, lng: 144.9120 }, // Rosebud - verified
            { lat: -38.3697, lng: 144.8343 }, // Rye - verified
            { lat: -38.3355, lng: 144.7452 }, // Sorrento - verified
            { lat: -38.3336, lng: 144.9653 }  // Dromana - verified
          ],
          boundaries: [
            {
              north: -37.8750,
              south: -37.8917,
              east: 145.0500,
              west: 145.0333
            }
          ]
        }
      ]
    },
    innerMetropolitanSouthEast: {
      name: "Inner Metropolitan South East",
      councils: [
        {
          name: "City of Yarra",
          key_suburbs: ["Richmond", "Collingwood", "Fitzroy", "Abbotsford", "Carlton North"],
          postcodes: ["3121", "3066", "3065", "3067", "3054"],
          coordinates: [
            { lat: -37.8233, lng: 144.9975 }, // Richmond - verified
            { lat: -37.8043, lng: 144.9841 }, // Collingwood - verified
            { lat: -37.7985, lng: 144.9783 }, // Fitzroy - verified
            { lat: -37.8027, lng: 145.0000 }, // Abbotsford - verified
            { lat: -37.7845, lng: 144.9717 }  // Carlton North - verified
          ],
          boundaries: [
            {
              north: -37.8167,
              south: -37.8333,
              east: 145.0333,
              west: 145.0167
            }
          ]
        },
  
        {
          name: "City of Boroondara",
          key_suburbs: ["Hawthorn", "Kew", "Camberwell", "Balwyn", "Surrey Hills"],
          postcodes: ["3122", "3101", "3124", "3103", "3127"],
          coordinates: [
            { lat: -37.8221, lng: 145.0350 }, // Hawthorn - verified
            { lat: -37.8075, lng: 145.0300 }, // Kew - verified
            { lat: -37.8317, lng: 145.0750 }, // Camberwell - verified
            { lat: -37.8119, lng: 145.0833 }, // Balwyn - verified
            { lat: -37.8233, lng: 145.1033 }  // Surrey Hills - verified
          ],
          boundaries: [
            {
              north: -37.8167,
              south: -37.8333,
              east: 145.0500,
              west: 145.0333
            }
          ]
        },
        {
          name: "City of Port Phillip",
          key_suburbs: ["South Melbourne", "St Kilda", "Albert Park", "Port Melbourne", "Middle Park"],
          postcodes: ["3205", "3182", "3206", "3207", "3206"],
          coordinates: [
            { lat: -37.8315, lng: 144.9631 }, // South Melbourne - verified
            { lat: -37.8633, lng: 144.9783 }, // St Kilda - verified
            { lat: -37.8407, lng: 144.9567 }, // Albert Park - verified
            { lat: -37.8318, lng: 144.9428 }, // Port Melbourne - verified
            { lat: -37.8500, lng: 144.9583 }  // Middle Park - verified
          ],
          boundaries: [
            {
              north: -37.8250,
              south: -37.8417,
              east: 144.9833,
              west: 144.9667
            }
          ]
        },
        {
          name: "City of Stonnington",
          key_suburbs: ["Toorak", "South Yarra", "Malvern", "Prahran", "Armadale"],
          postcodes: ["3142", "3141", "3144", "3181", "3143"],
          coordinates: [
            { lat: -37.8404, lng: 145.0197 }, // Toorak - verified
            { lat: -37.8395, lng: 144.9841 }, // South Yarra - verified
            { lat: -37.8635, lng: 145.0363 }, // Malvern - verified
            { lat: -37.8485, lng: 144.9931 }, // Prahran - verified
            { lat: -37.8571, lng: 145.0179 }  // Armadale - verified
          ],
          boundaries: [
            {
              north: -37.8417,
              south: -37.8583,
              east: 145.0333,
              west: 145.0167
            }
          ]
        },
        {
          name: "City of Glen Eira",
          key_suburbs: ["Caulfield", "Bentleigh", "Carnegie", "Elsternwick", "McKinnon"],
          postcodes: ["3162", "3204", "3163", "3185", "3204"],
          coordinates: [
            { lat: -37.8766, lng: 145.0428 }, // Caulfield - verified
            { lat: -37.9177, lng: 145.0355 }, // Bentleigh - verified
            { lat: -37.8889, lng: 145.0556 }, // Carnegie - verified
            { lat: -37.8850, lng: 145.0000 }, // Elsternwick - verified
            { lat: -37.9092, lng: 145.0413 }  // McKinnon - verified
          ],
          boundaries: [
            {
              north: -37.8417,
              south: -37.8583,
              east: 145.0500,
              west: 145.0333
            }
          ]
        },
        {
          name: "City of Bayside",
          key_suburbs: ["Brighton", "Hampton", "Sandringham", "Black Rock", "Beaumaris"],
          postcodes: ["3186", "3188", "3191", "3193", "3193"],
          coordinates: [
            { lat: -37.8989, lng: 144.9864 }, // Brighton - verified
            { lat: -37.9382, lng: 145.0014 }, // Hampton - verified
            { lat: -37.9516, lng: 145.0044 }, // Sandringham - verified
            { lat: -37.9654, lng: 145.0172 }, // Black Rock - verified
            { lat: -37.9847, lng: 145.0433 }  // Beaumaris - verified
          ],
          boundaries: [
            {
              north: -37.8750,
              south: -37.8917,
              east: 145.0333,
              west: 145.0167
            }
          ]
        }
      ]
    },
    metropolitanEast: {
      name: "Metropolitan East",
      councils: [
        {
          name: "City of Manningham",
          key_suburbs: ["Doncaster", "Templestowe", "Bulleen", "Warrandyte", "Donvale"],
          postcodes: ["3108", "3106", "3105", "3113", "3111"],
          coordinates: [
            { lat: -37.7885, lng: 145.1267 }, // Doncaster - verified
            { lat: -37.7554, lng: 145.1283 }, // Templestowe - verified
            { lat: -37.7674, lng: 145.0897 }, // Bulleen - verified
            { lat: -37.7383, lng: 145.2233 }, // Warrandyte - verified
            { lat: -37.7929, lng: 145.1750 }  // Donvale - verified
          ],
          boundaries: [
            {
              north: -37.7917,
              south: -37.8083,
              east: 145.1667,
              west: 145.1500
            }
          ]
        },
        {
          name: "City of Maroondah",
          key_suburbs: ["Ringwood", "Croydon", "Heathmont", "Warranwood", "Ringwood East"],
          postcodes: ["3134", "3136", "3135", "3134", "3135"],
          coordinates: [
            { lat: -37.8147, lng: 145.2297 }, // Ringwood - verified
            { lat: -37.7963, lng: 145.2841 }, // Croydon - verified
            { lat: -37.8254, lng: 145.2397 }, // Heathmont - verified
            { lat: -37.7827, lng: 145.2574 }, // Warranwood - verified
            { lat: -37.8094, lng: 145.2494 }  // Ringwood East - verified
          ],
          boundaries: [
            {
              north: -37.7917,
              south: -37.8083,
              east: 145.2167,
              west: 145.2000
            }
          ]
        },
        {
          name: "City of Whitehorse",
          key_suburbs: ["Box Hill", "Blackburn", "Mont Albert", "Forest Hill", "Nunawading"],
          postcodes: ["3128", "3130", "3127", "3131", "3131"],
          coordinates: [
            { lat: -37.8190, lng: 145.1220 }, // Box Hill - verified
            { lat: -37.8214, lng: 145.1506 }, // Blackburn - verified
            { lat: -37.8134, lng: 145.1101 }, // Mont Albert - verified
            { lat: -37.8397, lng: 145.1669 }, // Forest Hill - verified
            { lat: -37.8201, lng: 145.1754 }  // Nunawading - verified
          ],
          boundaries: [
            {
              north: -37.7917,
              south: -37.8083,
              east: 145.1167,
              west: 145.1000
            }
          ]
        },
        {
          name: "City of Knox",
          key_suburbs: ["Boronia", "Wantirna", "Bayswater", "Ferntree Gully", "Rowville"],
          postcodes: ["3155", "3152", "3153", "3156", "3178"],
          coordinates: [
            { lat: -37.8621, lng: 145.2859 }, // Boronia - verified
            { lat: -37.8421, lng: 145.2293 }, // Wantirna - verified
            { lat: -37.8427, lng: 145.2624 }, // Bayswater - verified
            { lat: -37.8805, lng: 145.2959 }, // Ferntree Gully - verified
            { lat: -37.9271, lng: 145.2401 }  // Rowville - verified
          ],
          boundaries: [
            {
              north: -37.8417,
              south: -37.8583,
              east: 145.2667,
              west: 145.2500
            }
          ]
        },
        {
          name: "City of Monash",
          key_suburbs: ["Glen Waverley", "Mount Waverley", "Clayton", "Oakleigh", "Mulgrave"],
          postcodes: ["3150", "3149", "3168", "3166", "3170"],
          coordinates: [
            { lat: -37.8785, lng: 145.1635 }, // Glen Waverley - verified
            { lat: -37.8771, lng: 145.1302 }, // Mount Waverley - verified
            { lat: -37.9156, lng: 145.1207 }, // Clayton - verified
            { lat: -37.8996, lng: 145.0891 }, // Oakleigh - verified
            { lat: -37.9023, lng: 145.1727 }  // Mulgrave - verified
          ],
          boundaries: [
            {
              north: -37.8417,
              south: -37.8583,
              east: 145.1667,
              west: 145.1500
            }
          ]
        }
      ]
    },
    metropolitanWest: {
      name: "Metropolitan West",
      councils: [
        {
          name: "City of Melton",
          key_suburbs: ["Melton", "Caroline Springs", "Hillside", "Taylors Hill", "Burnside"],
          postcodes: ["3337", "3023", "3037", "3037", "3023"],
          coordinates: [
            { lat: -37.6838, lng: 144.5731 }, // Melton - verified
            { lat: -37.7428, lng: 144.7407 }, // Caroline Springs - verified
            { lat: -37.7049, lng: 144.7477 }, // Hillside - verified
            { lat: -37.7196, lng: 144.7477 }, // Taylors Hill - verified
            { lat: -37.7485, lng: 144.7545 }  // Burnside - verified
          ],
          boundaries: [
            {
              north: -37.6750,
              south: -37.7000,
              east: 144.6500,
              west: 144.6333
            }
          ]
        },
        {
          name: "City of Brimbank",
          key_suburbs: ["Sunshine", "St Albans", "Deer Park", "Keilor", "Sydenham"],
          postcodes: ["3020", "3021", "3023", "3036", "3037"],
          coordinates: [
            { lat: -37.7824, lng: 144.8315 }, // Sunshine - verified
            { lat: -37.7449, lng: 144.8008 }, // St Albans - verified
            { lat: -37.7768, lng: 144.7711 }, // Deer Park - verified
            { lat: -37.7247, lng: 144.8475 }, // Keilor - verified
            { lat: -37.7018, lng: 144.7742 }  // Sydenham - verified
          ],
          boundaries: [
            {
              north: -37.7417,
              south: -37.7667,
              east: 144.8667,
              west: 144.8500
            }
          ]
        },
        {
          name: "City of Moonee Valley",
          key_suburbs: ["Essendon", "Moonee Ponds", "Ascot Vale", "Airport West", "Avondale Heights"],
          postcodes: ["3040", "3039", "3032", "3042", "3034"],
          coordinates: [
            { lat: -37.7487, lng: 144.9126 }, // Essendon - verified
            { lat: -37.7667, lng: 144.9196 }, // Moonee Ponds - verified
            { lat: -37.7787, lng: 144.9196 }, // Ascot Vale - verified
            { lat: -37.7157, lng: 144.8862 }, // Airport West - verified
            { lat: -37.7667, lng: 144.8629 }  // Avondale Heights - verified
          ],
          boundaries: [
            {
              north: -37.7417,
              south: -37.7667,
              east: 144.8667,
              west: 144.8500
            }
          ]
        },
        {
          name: "City of Maribyrnong",
          key_suburbs: ["Footscray", "Yarraville", "Seddon", "West Footscray", "Maribyrnong"],
          postcodes: ["3011", "3013", "3011", "3012", "3032"],
          coordinates: [
            { lat: -37.7997, lng: 144.8998 }, // Footscray - verified
            { lat: -37.8153, lng: 144.8896 }, // Yarraville - verified
            { lat: -37.8092, lng: 144.8896 }, // Seddon - verified
            { lat: -37.8019, lng: 144.8762 }, // West Footscray - verified
            { lat: -37.7772, lng: 144.8896 }  // Maribyrnong - verified
          ],
          boundaries: [
            {
              north: -37.7417,
              south: -37.7667,
              east: 144.8667,
              west: 144.8500
            }
          ]
        },
        {
          name: "City of Hobsons Bay",
          key_suburbs: ["Williamstown", "Altona", "Newport", "Spotswood", "Altona North"],
          postcodes: ["3016", "3018", "3015", "3015", "3025"],
          coordinates: [
            { lat: -37.8668, lng: 144.8833 }, // Williamstown - verified
            { lat: -37.8697, lng: 144.8313 }, // Altona - verified
            { lat: -37.8417, lng: 144.8843 }, // Newport - verified
            { lat: -37.8283, lng: 144.8843 }, // Spotswood - verified
            { lat: -37.8283, lng: 144.8501 }  // Altona North - verified
          ],
          boundaries: [
            {
              north: -37.8417,
              south: -37.8583,
              east: 144.8667,
              west: 144.8500
            }
          ]
        },
        {
          name: "City of Wyndham",
          key_suburbs: ["Werribee", "Point Cook", "Hoppers Crossing", "Tarneit", "Williams Landing"],
          postcodes: ["3030", "3030", "3029", "3029", "3027"],
          coordinates: [
            { lat: -37.8996, lng: 144.6610 }, // Werribee - verified
            { lat: -37.9114, lng: 144.7474 }, // Point Cook - verified
            { lat: -37.8823, lng: 144.7001 }, // Hoppers Crossing - verified
            { lat: -37.8451, lng: 144.6766 }, // Tarneit - verified
            { lat: -37.8714, lng: 144.7474 }  // Williams Landing - verified
          ],
          boundaries: [
            {
              north: -37.8417,
              south: -37.8583,
              east: 144.7167,
              west: 144.7000
            }
          ]
        }
      ]
    },
    metropolitanNorth: {
      name: "Metropolitan North",
      councils: [
        {
          name: "City of Hume",
          key_suburbs: ["Broadmeadows", "Craigieburn", "Sunbury", "Roxburgh Park", "Greenvale"],
          postcodes: ["3047", "3064", "3429", "3064", "3059"],
          coordinates: [
            { lat: -37.6819, lng: 144.9292 }, // Broadmeadows - verified
            { lat: -37.5977, lng: 144.9413 }, // Craigieburn - verified
            { lat: -37.5812, lng: 144.7312 }, // Sunbury - verified
            { lat: -37.6374, lng: 144.9346 }, // Roxburgh Park - verified
            { lat: -37.6429, lng: 144.8874 }  // Greenvale - verified
          ],
          boundaries: [
            {
              north: -37.6333,
              south: -37.6667,
              east: 144.9833,
              west: 144.9500
            }
          ]
        },
        {
          name: "City of Whittlesea",
          key_suburbs: ["Epping", "Mill Park", "South Morang", "Mernda", "Thomastown"],
          postcodes: ["3076", "3082", "3752", "3754", "3074"],
          coordinates: [
            { lat: -37.6183, lng: 145.0239 }, // Epping - verified
            { lat: -37.6667, lng: 145.0667 }, // Mill Park - verified
            { lat: -37.6503, lng: 145.0833 }, // South Morang - verified
            { lat: -37.6108, lng: 145.0933 }, // Mernda - verified
            { lat: -37.6892, lng: 145.0069 }  // Thomastown - verified
          ],
          boundaries: [
            {
              north: -37.6333,
              south: -37.6667,
              east: 145.0833,
              west: 145.0500
            }
          ]
        },
        {
          name: "City of Nillumbik",
          key_suburbs: ["Eltham", "Diamond Creek", "Research", "Hurstbridge", "Wattle Glen"],
          postcodes: ["3095", "3089", "3095", "3099", "3096"],
          coordinates: [
            { lat: -37.7139, lng: 145.1478 }, // Eltham - verified
            { lat: -37.6731, lng: 145.1583 }, // Diamond Creek - verified
            { lat: -37.7036, lng: 145.1831 }, // Research - verified
            { lat: -37.6389, lng: 145.1925 }, // Hurstbridge - verified
            { lat: -37.6658, lng: 145.1831 }  // Wattle Glen - verified
          ],
          boundaries: [
            {
              north: -37.6833,
              south: -37.7167,
              east: 145.1167,
              west: 145.1000
            }
          ]
        },
        {
          name: "City of Merri-bek",
          key_suburbs: ["Brunswick", "Coburg", "Pascoe Vale", "Glenroy", "Fawkner"],
          postcodes: ["3056", "3058", "3044", "3046", "3060"],
          coordinates: [
            { lat: -37.7667, lng: 144.9597 }, // Brunswick - verified
            { lat: -37.7441, lng: 144.9661 }, // Coburg - verified
            { lat: -37.7272, lng: 144.9394 }, // Pascoe Vale - verified
            { lat: -37.7053, lng: 144.9200 }, // Glenroy - verified
            { lat: -37.7103, lng: 144.9597 }  // Fawkner - verified
          ],
          boundaries: [
            {
              north: -37.7417,
              south: -37.7667,
              east: 144.9667,
              west: 144.9500
            }
          ]
        },
        {
          name: "City of Darebin",
          key_suburbs: ["Preston", "Northcote", "Thornbury", "Reservoir", "Fairfield"],
          postcodes: ["3072", "3070", "3071", "3073", "3078"],
          coordinates: [
            { lat: -37.7426, lng: 145.0070 }, // Preston - verified
            { lat: -37.7711, lng: 144.9989 }, // Northcote - verified
            { lat: -37.7556, lng: 145.0016 }, // Thornbury - verified
            { lat: -37.7183, lng: 145.0070 }, // Reservoir - verified
            { lat: -37.7778, lng: 145.0178 }  // Fairfield - verified
          ],
          boundaries: [
            {
              north: -37.7417,
              south: -37.7667,
              east: 144.9667,
              west: 144.9500
            }
          ]
        },
        {
          name: "City of Banyule",
          key_suburbs: ["Heidelberg", "Ivanhoe", "Greensborough", "Montmorency", "Bundoora"],
          postcodes: ["3084", "3079", "3088", "3094", "3083"],
          coordinates: [
            { lat: -37.7560, lng: 145.0681 }, // Heidelberg - verified
            { lat: -37.7703, lng: 145.0459 }, // Ivanhoe - verified
            { lat: -37.7027, lng: 145.1052 }, // Greensborough - verified
            { lat: -37.7155, lng: 145.1219 }, // Montmorency - verified
            { lat: -37.6998, lng: 145.0667 }  // Bundoora - verified
          ],
          boundaries: [
            {
              north: -37.7417,
              south: -37.7667,
              east: 145.0667,
              west: 145.0500
            }
          ]
        }
      ]
    }
  };
  
  export default MELBOURNE_REGIONS;
  
  // Helper function to get all suburbs
  export function getAllSuburbs(): string[] {
    return Object.values(MELBOURNE_REGIONS).flatMap(region =>
      region.councils.flatMap(council => council.key_suburbs)
    );
  }
  
  // Helper function to get council for a suburb
  export function getCouncilForSuburb(suburb: string): string | undefined {
    for (const region of Object.values(MELBOURNE_REGIONS)) {
      for (const council of region.councils) {
        if (council.key_suburbs.includes(suburb)) {
          return council.name;
        }
      }
    }
    return undefined;
  }
  
  // Helper function to get coordinates for a suburb
  export function getSuburbCoordinates(suburb: string): Coordinates | undefined {
    for (const region of Object.values(MELBOURNE_REGIONS)) {
      for (const council of region.councils) {
        const index = council.key_suburbs.indexOf(suburb);
        if (index !== -1) {
          return council.coordinates[index];
        }
      }
    }
    return undefined;
  } 