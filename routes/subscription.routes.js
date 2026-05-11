const router = require("express").Router();
const {
  createSubscription,
  updateSubscription,
  deleteSubscription,
  deactivateSubscription,
  getPickupSubscriptions,
  getUserSubscriptions,
} = require("../controllers/subscription.controller");

/*
==================================================
1. CREATE SUBSCRIPTION
==================================================
*/

router.post("/create", createSubscription);

/*
==================================================
2. UPDATE SUBSCRIPTION
==================================================

USED WHEN:

Parent changes:
- alert location
- radius
- alert settings
- subscription name

--------------------------------------------------

PUT
/api/subscription/update/subscription?subscriptionId=SUB-12345

BODY:

{
  "name": "New Alert Point",

  "location": {
    

    "coordinates": [
      77.2011,
      28.6120
    ]
  },

  "radius": 100
}

--------------------------------------------------

SUCCESS RESPONSE:

{
  "success": true,

  "message":
  "Subscription updated successfully",

  "data": {
    "subscriptionId":
    "SUB-12345"
  }
}
*/

router.put("/update/subscription", updateSubscription);

/*
==================================================
3. DELETE SUBSCRIPTION
==================================================

USED WHEN:

Parent permanently deletes
subscription.

--------------------------------------------------

DELETE
/api/subscription/delete/subscription?subscriptionId=SUB-12345

--------------------------------------------------

SUCCESS RESPONSE:

{
  "success": true,

  "message":
  "Subscription deleted successfully"
}
*/

router.delete("/delete/subscription", deleteSubscription);

/*
==================================================
4. DEACTIVATE SUBSCRIPTION
==================================================

USED WHEN:

Parent temporarily disables alerts
without deleting subscription.

Example:
- vacation
- leave
- temporary transport change

--------------------------------------------------

PUT
/api/subscription/deactivate/subscription?subscriptionId=SUB-12345

--------------------------------------------------

SUCCESS RESPONSE:

{
  "success": true,

  "message":
  "Subscription deactivated"
}
*/

router.put("/deactivate/subscription", deactivateSubscription);

/*
==================================================
5. GET PICKUP SUBSCRIPTIONS
==================================================

USED INTERNALLY BY:

- Kafka consumers
- geofence engine
- realtime GPS workers

IMPORTANT:

Frontend usually DOES NOT call this.

--------------------------------------------------

GET
/api/subscription/pickup/linkedPickupPoint?linkedPickupPointId=PP001

--------------------------------------------------

SUCCESS RESPONSE:

{
  "success": true,

  "count": 2,

  "data": [
    {
      "subscriptionId":
      "SUB-12345",

      "userId":
      "USR001",

      "name":
      "Near Temple"
    }
  ]
}
*/

router.get("/pickup/linkedPickupPoint", getPickupSubscriptions);

/*
==================================================
6. GET USER SUBSCRIPTIONS
==================================================

USED WHEN:

Parent opens:
- My Alerts
- My Subscription Points

--------------------------------------------------

GET
/api/subscription/getUserSubscriptionsById?userId=USR001

--------------------------------------------------

SUCCESS RESPONSE:

{
  "success": true,

  "count": 2,

  "data": [
    {
      "subscriptionId":
      "SUB-12345",

      "name":
      "Near Temple",

      "active": true
    }
  ]
}
*/

router.get("/getUserSubscriptionsById", getUserSubscriptions);
module.exports = router;