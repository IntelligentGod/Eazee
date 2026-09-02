const { withAndroidManifest } = require("expo/config-plugins");
const fs = require('fs');

module.exports = function androidManifestPlugin(config) {
  console.log("Android Manifest Plugin is running");
  
  return withAndroidManifest(config, async (config) => {
    console.log("Inside withAndroidManifest callback");
    const androidManifest = config.modResults.manifest;

    console.log("Current manifest structure:", JSON.stringify(androidManifest, null, 2));

    if (!androidManifest['uses-permission']) {
      androidManifest['uses-permission'] = [];
    }

    const recordAudioPermission = androidManifest['uses-permission'].find(
      (perm) => perm.$['android:name'] === 'android.permission.RECORD_AUDIO'
    );
    
    if (!recordAudioPermission) {
      console.log("Adding RECORD_AUDIO permission");
      androidManifest['uses-permission'].push({
        $: {
          "android:name": "android.permission.RECORD_AUDIO"
        }
      });
    }

    if (!androidManifest.application) {
      console.log("No application tag found, creating one");
      androidManifest.application = [{}];
    }

    if (!androidManifest.application[0].$) {
      androidManifest.application[0].$ = {};
    }

    if (!androidManifest.application[0]["meta-data"]) {
      console.log("No meta-data array found, creating one");
      androidManifest.application[0]["meta-data"] = [];
    }

    const existingApiKey = androidManifest.application[0]["meta-data"].find(
      (item) => item.$["android:name"] === "com.google.android.geo.API_KEY"
    );

    if (existingApiKey) {
      console.log("Updating existing API key");
      existingApiKey.$["android:value"] = "AIzaSyBd3itAwpqm2gIkViR3ynowDG8Ba2fyfQc";
    } else {
      console.log("Adding new API key meta-data");
      androidManifest.application[0]["meta-data"].push({
        $: {
          "android:name": "com.google.android.geo.API_KEY",
          "android:value": "AIzaSyBd3itAwpqm2gIkViR3ynowDG8Ba2fyfQc",
        },
      });
    }

    if (!androidManifest.application[0].activity) {
      androidManifest.application[0].activity = [{}];
    }

    const mainActivity = androidManifest.application[0].activity.find(
      activity => activity.$['android:name'] === '.MainActivity'
    );

    if (mainActivity) {
      if (!mainActivity['intent-filter']) {
        mainActivity['intent-filter'] = [];
      }

      const amazonIntentFilter = {
        action: [{ $: { "android:name": "android.intent.action.VIEW" } }],
        category: [
          { $: { "android:name": "android.intent.category.DEFAULT" } },
          { $: { "android:name": "android.intent.category.BROWSABLE" } }
        ],
        data: [
          { $: { "android:scheme": "amzn" } }
        ]
      };
      const existingFilter = mainActivity['intent-filter'].find(
        filter => filter.data && filter.data.some(d => d.$["android:scheme"] === "amzn")
      );
      
      if (!existingFilter) {
        console.log("Adding Amazon app deep link intent filter");
        mainActivity['intent-filter'].push(amazonIntentFilter);
      }
    } else {
      console.warn("MainActivity not found in AndroidManifest.xml");
    }

    if (!androidManifest.queries) {
      console.log("Adding <queries> element");
      androidManifest.queries = [
        {
          package: [
            { $: { "android:name": "com.amazon.mShop.android.shopping" } }
          ]
        }
      ];
    } else {
      if (!Array.isArray(androidManifest.queries)) {
        androidManifest.queries = [androidManifest.queries];
      }
      
      if (!androidManifest.queries[0].package) {
        androidManifest.queries[0].package = [];
      }
      
      const existingAmazonPackage = androidManifest.queries[0].package.find(
        pkg => pkg && pkg.$ && pkg.$["android:name"] === "com.amazon.mShop.android.shopping"
      );
    
      if (!existingAmazonPackage) {
        console.log("Adding Amazon shopping app package to <queries>");
        androidManifest.queries[0].package.push(
          { $: { "android:name": "com.amazon.mShop.android.shopping" } }
        );
      }
    }

    console.log("Updated manifest structure:", JSON.stringify(androidManifest, null, 2));

    // Write the manifest to a file for debugging
    fs.writeFileSync('debug_manifest.json', JSON.stringify(androidManifest, null, 2));

    return config;
  });
};