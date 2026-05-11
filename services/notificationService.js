const {
  messaging,
  db,
} = require(
  "../config/firebase"
);

async function sendAlert(
  payload
) {

  try {

    /*
    MULTIPLE USERS
    */

    if (payload.users) {

      for (const user of payload.users) {

        const userData =
          await db
            .ref(
              `users/${user.userId}`
            )
            .once("value");

        const token =
          userData.val()?.fcmToken;

        if (!token) continue;

        await messaging.send({

          token,

          notification: {

            title:
              payload.title,

            body:
              payload.body,
          },

          data: {

            type:
              payload.type,

            busNumber:
              String(
                payload.busNumber
              ),
          },
        });
      }
    }

    /*
    SINGLE USER
    */

    if (payload.userId) {

      const userData =
        await db
          .ref(
            `users/${payload.userId}`
          )
          .once("value");

      const token =
        userData.val()?.fcmToken;

      if (!token) return;

      await messaging.send({

        token,

        notification: {

          title:
            payload.title,

          body:
            payload.body,
        },

        data: {

          type:
            payload.type,

          busNumber:
            String(
              payload.busNumber
            ),
        },
      });
    }

  } catch (err) {

    console.log(
      "Notification Error:",
      err
    );
  }
}

module.exports = {
  sendAlert,
};