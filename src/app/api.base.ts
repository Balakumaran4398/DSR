export class URL {

    static CURRENT_VERSION(): String {
        // return "v1.0.8"
        // return "v-1.8.1"
        return "v-1.8.4"
    }

    static RELEASE_DATE(): String {
        // return "Monday, 01 June 2026";
        // return "Saturday, 20 June 2026";
        return "Tuesday, 21 July 2026";
    }

    static AUTH_URL(): String {
        return 'http://192.168.1.113:8082/api/auth'; // local me
        // return 'http://192.168.1.195:8082/api/auth'; // local Vasanth
        // return 'http://192.168.1.148:8081/api/auth'; // local jeeva
        // return 'http://103.183.47.213:8585/dsr/api/auth'; // QC
        // return 'https://crm.ridsys.in:8080/dsr/api/auth'; //dsr
    }

    static BASE_URL(): String {
        return 'http://192.168.1.113:8082/api/v1';  // local me
        // return 'http://192.168.1.195:8082/api/v1';  // local Vasanth
        // return 'http://192.168.1.148:8081/api/v1';  // local jeeva
        // return 'http://103.183.47.213:8585/dsr/api/v1';  // QC
        // return 'https://crm.ridsys.in:8080/dsr/api/v1'; //dsr
    }

    static WEB_URL(): String {
        return 'http://192.168.1.113:8082/api/v1';  // local me 
        // return 'http://192.168.1.195:8082/api/v1';  // local Vasanth
        // return 'http://192.168.1.148:8081/api/v1';  // local jeeva
        // return 'http://103.183.47.213:8585/dsr/api/v1';  // QC   
        // return 'https://crm.ridsys.in'; //dsr 
    }

}





























































