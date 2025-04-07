// controller.js
const client = require("./connection");
const admin = require("./firebaseAdmin.js");
const { getMessaging } = require("firebase-admin/messaging");
const db = admin.firestore();

const getCurrentTimestamp = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0"); // Months are zero-indexed
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};


const haversineDistance = (lat1, lon1, lat2, lon2) => {
  const toRadians = (degrees) => degrees * (Math.PI / 180);
  const R = 6371; // Radius of the Earth in km

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return distance;
};

const generatePin = () => {
  return Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit random number
};

const formattedDate = () => {
  const currentDateTime = new Date();
  return currentDateTime.toLocaleDateString();
};

const formattedTime = () => {
  const currentDateTime = new Date();
  return currentDateTime.toLocaleTimeString();
};

const getAllLocations = async (workerIds) => {
  try {
    if (workerIds.length < 1) {
      return [];
    }
    const locationsRef = db.collection("locations");

    // Create a query to filter documents where workerId is in the workerIds array
    const query = locationsRef.where("worker_id", "in", workerIds);

    const snapshot = await query.get();

    if (snapshot.empty) {
      return [];
    }

    let locations = [];
    snapshot.forEach((doc) => {
      locations.push({ id: doc.id, ...doc.data() });
    });
    // // console.log(locations)
    return locations;
  } catch (error) {
    console.error("Error getting locations:", error);
    return [];
  }
};

const deleteTokenFromDB = async (token) => {
  try {
    const result = await client.query('DELETE FROM fcm WHERE fcm_token = $1', [token]);
    if (result.rowCount > 0) {
      // console.log(`Token ${token} deleted successfully from the database.`);
    } else {
      // console.log(`Token ${token} was not found in the database.`);
    }
    return result;
  } catch (error) {
    console.error(`Error deleting token ${token} from the database:`, error);
    throw error;
  }
}


const getWorkersNearby = async (req, res) => {
    try {
      // ------------------------------------------------------------------
      //  1) Extract request data
      // ------------------------------------------------------------------
      const user_id = req.user.id;
      const {
        area,
        pincode,
        city,
        alternateName,
        alternatePhoneNumber,
        serviceBooked,   // array of { serviceName, cost }
        discount,
        tipAmount,
        offer
      } = req.body;
  
      const created_at = getCurrentTimestamp();
      const serviceArray = JSON.stringify(serviceBooked);   // e.g. '[{"serviceName":"...","cost": 250}, ...]'
      const serviceNames = serviceBooked.map((s) => s.serviceName);
      const totalCost =
        serviceBooked.reduce((acc, s) => acc + s.cost, 0) - discount + tipAmount;
  
      // ------------------------------------------------------------------
      //  2) Postgres Query #1: Insert userNotifications, find matching workers
      // ------------------------------------------------------------------
      const query1 = `
        WITH user_loc AS (
          SELECT u.user_id, ul.longitude, ul.latitude
          FROM "user" u
          JOIN userlocation ul ON u.user_id = ul.user_id
          WHERE u.user_id = $1
        ),
        inserted_user_notifications AS (
          INSERT INTO userNotifications (
            user_id, longitude, latitude, created_at,
            area, pincode, city, alternate_name,
            alternate_phone_number, service_booked
          )
          SELECT
            user_loc.user_id,
            user_loc.longitude,
            user_loc.latitude,
            $2,  -- created_at
            $3,  -- area
            $4,  -- pincode
            $5,  -- city
            $6,  -- alternateName
            $7,  -- alternatePhoneNumber
            $8   -- serviceArray
          FROM user_loc
          RETURNING user_notification_id
        ),
        matching_workers AS (
          SELECT ws.worker_id
          FROM workerskills ws
          JOIN workersverified wv ON ws.worker_id = wv.worker_id
          WHERE $9::text[] <@ ws.subservices
            AND wv.no_due = TRUE  -- Ensure workers have no due payments
          GROUP BY ws.worker_id
        )
        SELECT
          (SELECT user_notification_id FROM inserted_user_notifications) AS user_notification_id,
          array_agg(mw.worker_id) AS worker_ids,
          (SELECT latitude FROM user_loc) AS user_lat,
          (SELECT longitude FROM user_loc) AS user_lon
        FROM matching_workers mw;
      `;
  
      const query1Params = [
        user_id,           // $1
        created_at,        // $2
        area,              // $3
        pincode,           // $4
        city,              // $5
        alternateName,     // $6
        alternatePhoneNumber, // $7
        serviceArray,      // $8
        serviceNames,      // $9 :: text[]
      ];
  
      const result1 = await client.query(query1, query1Params);
      if (result1.rows.length === 0) {
        return res
          .status(404)
          .json("No user found or no worker matches subservices");
      }
  
      const { user_notification_id, worker_ids, user_lat, user_lon } = result1.rows[0];
  
      if (!user_notification_id) {
        return res.status(404).json("Failed to insert user notification");
      }
      if (!worker_ids || worker_ids.length === 0) {
        return res.status(200).json("No workers match the requested subservices");
      }
  
      // ------------------------------------------------------------------
      //  3) Firestore: Get worker locations once, filter by 2km radius
      // ------------------------------------------------------------------
      const workerDb = await getAllLocations(worker_ids); 
      if (!workerDb || workerDb.length === 0) {
        return res.status(200).json("No Firestore location data for these workers");
      }
  
      const MAX_DISTANCE = 2; // 2km
      const nearbyWorkers = [];
      for (const doc of workerDb) {
        const dist = haversineDistance(
          user_lat,
          user_lon,
          doc.location._latitude,
          doc.location._longitude
        );
        if (dist <= MAX_DISTANCE) {
          nearbyWorkers.push(doc.worker_id);
        }
      }
  
      if (nearbyWorkers.length === 0) {
        return res.status(200).json("No workers found within 2 km radius");
      }
  
      // ------------------------------------------------------------------
      //  4) Postgres Query #2: Insert notifications & retrieve FCM tokens
      // ------------------------------------------------------------------
      const pin = generatePin(); // e.g. 4-6 digit pin
      const query2 = `
        WITH insert_notifications AS (
          INSERT INTO notifications (
            user_notification_id, user_id, worker_id,
            longitude, latitude, created_at, pin, service_booked,
            discount, coupons_applied, total_cost, tip_amount
          )
          SELECT
            $1,  -- user_notification_id
            $2,  -- user_id
            w.worker_id,
            $3,  -- user_lon
            $4,  -- user_lat
            $5,  -- created_at
            $6,  -- pin
            $7,  -- serviceArray
            $9,  -- discount
            $12, -- coupons_applied
            $10, -- totalCost
            $11  -- tipAmount
          FROM UNNEST($8::int[]) AS w(worker_id)
          RETURNING worker_id
        ),
        fcm_tokens AS (
          SELECT fcm_token
          FROM fcm
          WHERE worker_id IN (SELECT worker_id FROM insert_notifications)
        )
        SELECT array_agg(fcm_token) AS tokens 
        FROM fcm_tokens;
      `;
  
      const query2Params = [
        user_notification_id, // $1
        user_id,              // $2
        user_lon,             // $3
        user_lat,             // $4
        created_at,           // $5
        pin,                  // $6
        serviceArray,         // $7
        nearbyWorkers,        // $8 :: int[]
        discount,             // $9
        totalCost,            // $10
        tipAmount,            // $11
        offer                 // $12 (for coupons_applied)
      ];
  
      const result2 = await client.query(query2, query2Params);
      const tokens = result2.rows[0].tokens || [];
  
      // ------------------------------------------------------------------
      //  5) If Offer Provided, Update "offers_used" with 'status: applied'
      // ------------------------------------------------------------------
      if (offer) {
        const offerCodeValue = offer.offer_code;
        const queryText = `
          UPDATE "user"
          SET offers_used = (
            SELECT jsonb_agg(
              CASE
                WHEN elem->>'offer_code' = $1
                  THEN elem || '{"status":"applied"}'
                ELSE elem
              END
            )
            FROM jsonb_array_elements("user".offers_used) elem
          )
          WHERE user_id = $2
        `;
        await client.query(queryText, [offerCodeValue, user_id]);
      }
  
      // ------------------------------------------------------------------
      //  6) Send FCM notifications (if tokens exist)
      // ------------------------------------------------------------------
      const encodedUserNotificationId = Buffer.from(
        user_notification_id.toString()
      ).toString("base64");
  
      if (tokens.length > 0) {
        const normalNotificationMessage = {
          tokens,
          notification: {
            title: "🔔 ClickSolver Has a Job for You!",
            body: "💼 A user needs help! Accept now to support your ClickSolver family. 🤝"
          },
          data: {
            user_notification_id: encodedUserNotificationId,
            service: serviceArray,
            location: `${area}, ${city}, ${pincode}`,
            click_action: "FLUTTER_NOTIFICATION_CLICK",
            cost: totalCost.toString(),
            targetUrl: `/acceptance/${encodedUserNotificationId}`,
            screen: "Acceptance",
            date: formattedDate(),
            time: formattedTime(),
            type: "normal",
          },
          android: { priority: "high" },
        };
      
        try {
          const fcmResponse = await getMessaging().sendEachForMulticast(normalNotificationMessage);
      
          let successCount = 0;
          let failureCount = 0;
      
          // Loop through responses to handle errors individually
          for (let i = 0; i < fcmResponse.responses.length; i++) {
            const resp = fcmResponse.responses[i];
            if (resp.success) {
              successCount++;
            } else {
              failureCount++;
              console.error(`❌ Error sending to token ${tokens[i]}:`, resp.error);
              // Check if token is not registered
              if (resp.error && resp.error.code === 'messaging/registration-token-not-registered') {
                try {
                  // Replace with your deletion logic
                  await deleteTokenFromDB(tokens[i]);
                  // console.log(`Removed invalid token: ${tokens[i]}`);
                } catch (deleteError) {
                  console.error(`Error deleting token ${tokens[i]}:`, deleteError);
                }
              }
            }
          }
          // console.log(`FCM Summary: ${successCount} success, ${failureCount} failures.`);
        } catch (err) {
          console.error("❌ Error sending FCM notifications:", err);
        }
      }
      
  
      // ------------------------------------------------------------------
      //  7) Return to Client
      // ------------------------------------------------------------------
      return res.status(200).json(encodedUserNotificationId);
    } catch (error) {
      console.error("Error in getWorkersNearby:", error);
      return res.status(500).json({ error: "Server error" });
    }
  };






module.exports = {
    getWorkersNearby,
}
