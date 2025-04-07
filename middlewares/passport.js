// middlewares/passport.js

const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/userSchema');

// Configures Google OAuth2 strategy for user authentication
passport.use(
    new GoogleStrategy(
        {
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: 'http://localhost:3000/user/auth/google/callback',
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                const existingUser = await User.findOne({ googleId: profile.id });

                if (existingUser) {
                    return done(null, existingUser);
                }

                const email = profile.emails && profile.emails.length > 0 ? profile.emails[0].value : null;

                const newUser = new User({
                    googleId: profile.id,
                    name: profile.displayName,
                    email: email,
                });

                await newUser.save();
                done(null, newUser);
            } catch (err) {
                done(err, null);
            }
        }
    )
);

// Serializes user data into the session
passport.serializeUser((user, done) => {
    done(null, user.id);
});

// Deserializes user data from the session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

module.exports = passport;