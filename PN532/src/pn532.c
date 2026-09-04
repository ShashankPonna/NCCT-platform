/**
 * @file pn532.c
 * @brief High-level driver for the PN532 RFID/NFC reader.
 * @details This driver implements communication with the PN532 via SPI, using
 *          interrupts (IRQ) for all wait operations. It encapsulates
 *          all protocol complexity, event management (semaphore),
 *          and ISR configuration, providing a simple blocking API
 *          for the application layer.
 */

/*================================= Header Inclusions =================================*/
#include "pn532.h"
#include "spi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/semphr.h"
#include "driver/gpio.h"
#include "esp_log.h"
#include "ansi_macro.h"
#include <string.h>
/*================================= Header Inclusions =================================*/


/*================================= Definitions and Constants =================================*/
static const char *TAG = BLUE "PN532" RESET;

int isr_counter = 0;

#define RFID_IRQ_PIN GPIO_NUM_25

#define PN532_PACKBUFFSIZ 64
#define PN532_DELAY(ms) vTaskDelay(pdMS_TO_TICKS(ms))

// --- PN532 Commands and Responses ---
#define PN532_COMMAND_GETFIRMWAREVERSION    (0x02)
#define PN532_COMMAND_SAMCONFIGURATION      (0x14)
#define PN532_COMMAND_INLISTPASSIVETARGET   (0x4A)
#define PN532_COMMAND_SETPARAMETERS         (0x12)
#define PN532_COMMAND_WRITEREGISTER         (0x08)
#define PN532_RESPONSE_INLISTPASSIVETARGET  (0x4B)

// --- Protocol Constants ---
#define PN532_PREAMBLE                      (0x00)
#define PN532_STARTCODE1                    (0x00)
#define PN532_STARTCODE2                    (0xFF)
#define PN532_POSTAMBLE                     (0x00)
#define PN532_HOSTTOPN532                   (0xD4)
#define PN532_PN532TOHOST                   (0xD5)

// --- SPI Constants ---
#define PN532_SPI_STATREAD                  (0x02)  //0bxxxx xx10
#define PN532_SPI_DATAWRITE                 (0x01)  //0bxxxx xx01
#define PN532_SPI_DATAREAD                  (0x03)  //0bxxxx xx11
#define PN532_SPI_READY                     (0x01)  

// --- MIFARE Constants ---
#define PN532_MIFARE_ISO14443A              (0x00)
/*================================= Definitions and Constants =================================*/


/*================================= Static Variables =================================*/
/** @brief Packet buffer to assemble and receive SPI frames. */
static uint8_t pn532_packetbuffer[PN532_PACKBUFFSIZ];

/** @brief Binary semaphore signaled by the IRQ pin ISR. */
static SemaphoreHandle_t pn532_irq_semaphore = NULL;
/*================================= Static Variables =================================*/


/*================================= Private Function Prototypes =================================*/
static void _pn532_isr_handler(void* arg);
static esp_err_t _pn532_irq_init(void);
static bool _write_full_command_frame(uint8_t *cmd, uint8_t cmdlen);
static bool _read_response_frame(uint8_t *buff, uint8_t n);
static bool _read_ack(void);
static bool _wait_for_irq(uint16_t timeout_ms);
static bool _send_command_wait_ack_irq(uint8_t *cmd, uint8_t cmdlen, uint16_t timeout);
/*================================= Private Function Prototypes =================================*/


/*================================= Public Function Implementation =================================*/
/**
 * @brief Initializes the PN532 driver, the semaphore, and the interrupt service routine (ISR).
 */
esp_err_t pn532_init(void) {
    if (pn532_irq_semaphore == NULL) {
        pn532_irq_semaphore = xSemaphoreCreateBinary();
        if (pn532_irq_semaphore == NULL) {
            ESP_LOGE(TAG, RED "Failed to create IRQ semaphore!" RESET);
            return ESP_FAIL;
        }
    }

    if (_pn532_irq_init() != ESP_OK) {
        return ESP_FAIL;
    }

    PN532_DELAY(500); // Wait for some time for the PN532 to stabilize
    
    spi_rfid_wakeup();

    return ESP_OK;
}

/**
 * @brief Configures the Secure Access Module (SAM) of the PN532.
 */
esp_err_t pn532_sam_config(void) {
    pn532_packetbuffer[0] = PN532_COMMAND_SAMCONFIGURATION;
    pn532_packetbuffer[1] = 0x01; // Normal Mode
    pn532_packetbuffer[2] = 0x14; // Timeout (50ms * 20 = 1s)
    pn532_packetbuffer[3] = 0x01; // Use IRQ pin

    if (!_send_command_wait_ack_irq(pn532_packetbuffer, 4, 1000)) {
        ESP_LOGE(TAG, RED "Did not receive ACK for SAMConfig." RESET);
        return ESP_FAIL;
    }
    if (!_wait_for_irq(1000)) {
        ESP_LOGE(TAG, RED "Did not receive response for SAMConfig." RESET);
        return ESP_FAIL;
    }
    if (!_read_response_frame(pn532_packetbuffer, 8)) {
        ESP_LOGI(TAG, RED "_read_response_frame failed in SAMConfig" RESET);
        return ESP_FAIL;
    }

    if (pn532_packetbuffer[6] == 0x15) {
        ESP_LOGI(TAG, GREEN "SAMConfig configured" RESET);
        return ESP_OK;
    }

    return ESP_FAIL;
}

/**
 * @brief Configures the power mode of the PN532 chip.
 */
esp_err_t pn532_set_power_mode(void) {
    pn532_packetbuffer[1] = 0xD4; 
    pn532_packetbuffer[0] = PN532_COMMAND_WRITEREGISTER;
    pn532_packetbuffer[2] = 0x02; 
    pn532_packetbuffer[3] = 0xFC;
    pn532_packetbuffer[3] = 0x00;

    if (!_send_command_wait_ack_irq(pn532_packetbuffer, 1, 2000)) {
        ESP_LOGE(TAG, RED "Did not receive ACK for setPowerMode." RESET);
        ESP_LOGI(TAG, "isr_counter = %d", isr_counter);
        return ESP_FAIL;
    }

    if (!_wait_for_irq(1000)) {
        ESP_LOGE(TAG, RED "Did not receive response for setPowerMode." RESET);
        return ESP_FAIL;
    }

    if (!_read_response_frame(pn532_packetbuffer, 9)) {
        ESP_LOGI(TAG, RED "_read_response_frame failed in setPowerMode" RESET);
        return ESP_FAIL;
    }

    /*==================================== DEBUG ====================================*/
    // char log_str_buffer[9 * 3 + 1];
    // for (int i = 0; i < 9; i++) {
    //     sprintf(&log_str_buffer[i * 3], "%02X ", pn532_packetbuffer[i]);
    // }
    // log_str_buffer[9 * 3] = '\0';
    // ESP_LOGI(TAG, "Response received (setPowerMode): %s", log_str_buffer);
    /*==================================== DEBUG ====================================*/

    const uint8_t expected_header[] = {0x00, 0x00, 0xFF, 0x02, 0xFE, 0xD5, 0x09, 0x22, 0x00};
    if (0 == memcmp(pn532_packetbuffer, expected_header, 9)) {
        ESP_LOGI(TAG, GREEN "PN532 configured" RESET);
        return ESP_OK;
    }
    
    ESP_LOGI(TAG, RED "Failed to configure power mode" RESET);
    return ESP_FAIL;
}

/**
 * @brief Gets the firmware version of the PN532 chip.
 */
esp_err_t pn532_get_firmware_version(void) {
    pn532_packetbuffer[0] = PN532_COMMAND_GETFIRMWAREVERSION;

    if (!_send_command_wait_ack_irq(pn532_packetbuffer, 1, 2000)) {
        ESP_LOGE(TAG, RED "Did not receive ACK for GetFirmwareVersion." RESET);
        ESP_LOGI(TAG, "isr_counter = %d", isr_counter);
        return ESP_FAIL;
    }

    if (!_wait_for_irq(1000)) {
        ESP_LOGE(TAG, RED "Did not receive response for GetFirmwareVersion." RESET);
        return ESP_FAIL;
    }

    if (!_read_response_frame(pn532_packetbuffer, 12)) {
        ESP_LOGI(TAG, RED "_read_response_frame failed" RESET);
        return ESP_FAIL;
    }

    /*==================================== DEBUG ====================================*/
    // char log_str_buffer[12 * 3 + 1];
    // for (int i = 0; i < 12; i++) {
    //     sprintf(&log_str_buffer[i * 3], "%02X ", pn532_packetbuffer[i]);
    // }
    // log_str_buffer[12 * 3] = '\0';
    // ESP_LOGI(TAG, "Response received (getFirmware): %s", log_str_buffer);
    /*==================================== DEBUG ====================================*/

    uint32_t version = 0;
    const uint8_t expected_header[] = {0x00, 0x00, 0xFF, 0x06, 0xFA, 0xD5, 0x03};
    if (0 == memcmp(pn532_packetbuffer, expected_header, 7)) {
        version = ((uint32_t)pn532_packetbuffer[6] << 24) |
                      ((uint32_t)pn532_packetbuffer[7] << 16) |
                      ((uint32_t)pn532_packetbuffer[8] << 8)  |
                      (uint32_t)pn532_packetbuffer[9];
        
        ESP_LOGI(TAG, "Chip " GREEN "PN5%02X" RESET " found " MAGENTA "(Firmware ver. %d.%d)" RESET, (uint8_t)(version >> 24), (uint8_t)(version >> 16), (uint8_t)(version >> 8));
        return ESP_OK;
    }
    
    ESP_LOGE(TAG, RED "Could not read PN532 firmware version." RESET);
    return ESP_FAIL;
}

/**
 * @brief Command for PN532 soft reset.
 */
esp_err_t pn532_soft_reset(void) {
    pn532_packetbuffer[0] = PN532_COMMAND_WRITEREGISTER;
    pn532_packetbuffer[1] = 0x62;   // High Byte of register address
    pn532_packetbuffer[2] = 0x03;   // Low Byte of register address
    pn532_packetbuffer[3] = 0x01;   // Soft Reset value  

    if (!_send_command_wait_ack_irq(pn532_packetbuffer, 1, 2000)) {
        ESP_LOGE(TAG, RED "Did not receive ACK for SoftReset." RESET);
        ESP_LOGI(TAG, "isr_counter = %d", isr_counter);
        return ESP_FAIL;
    }

    if (!_wait_for_irq(1000)) {
        ESP_LOGE(TAG, RED "Did not receive response for SoftReset." RESET);
        return ESP_FAIL;
    }

    if (!_read_response_frame(pn532_packetbuffer, 12)) {
        ESP_LOGI(TAG, RED "_read_response_frame failed" RESET);
        return ESP_FAIL;
    }

    ESP_LOGI(TAG, GREEN "Soft reset completed successfully" RESET);
    return ESP_OK;

    /*==================================== DEBUG ====================================*/
    // char log_str_buffer[12 * 3 + 1];
    // for (int i = 0; i < 12; i++) {
    //     sprintf(&log_str_buffer[i * 3], "%02X ", pn532_packetbuffer[i]);
    // }
    // log_str_buffer[12 * 3] = '\0';
    // ESP_LOGI(TAG, "Response received (softReset): %s", log_str_buffer);
    /*==================================== DEBUG ====================================*/
}

/**
 * @brief Arms the PN532 to detect a passive target (card).
 */
esp_err_t pn532_start_passive_target_detection(void) {
    pn532_packetbuffer[0] = PN532_COMMAND_INLISTPASSIVETARGET;
    pn532_packetbuffer[1] = 1;    // Maximum of 1 target
    pn532_packetbuffer[2] = PN532_MIFARE_ISO14443A;

    if (!_send_command_wait_ack_irq(pn532_packetbuffer, 3, 1000)) {
        ESP_LOGE(TAG, RED "Failed to arm PN532: did not receive ACK." RESET);
        return ESP_FAIL;
    }
    
    return ESP_OK;
}

/**
 * @brief Reads passive target data after detection.
 */
esp_err_t pn532_read_detected_passive_target(uint8_t *uid, uint8_t *uidLength) {
    if (uid == NULL || uidLength == NULL) return ESP_ERR_INVALID_ARG;

    if (!_read_response_frame(pn532_packetbuffer, 20)) {
        return ESP_FAIL;
    }

    const uint8_t expected_header[] = {0x00, 0x00, 0xFF};
    if (memcmp(pn532_packetbuffer, expected_header, 3) == 0 &&
        pn532_packetbuffer[5] == PN532_PN532TOHOST && 
        pn532_packetbuffer[6] == PN532_RESPONSE_INLISTPASSIVETARGET) {
        
        if (pn532_packetbuffer[7] == 1) { // 1 target found
            *uidLength = pn532_packetbuffer[12];
            if (*uidLength > 7) *uidLength = 7; // Buffer overflow prevention
            memcpy(uid, pn532_packetbuffer + 13, *uidLength);
            return ESP_OK;
        } else {
            return ESP_ERR_NOT_FOUND; // Valid response, but no targets
        }
    }
    
    ESP_LOGW(TAG, "Invalid response when reading detected target.");
    return ESP_FAIL;
}

/**
 * @brief Blocking function that arms the reader and waits for card detection.
 */
esp_err_t pn532_wait_for_card(void) {
    if (pn532_start_passive_target_detection() != ESP_OK) {
        ESP_LOGI(TAG, RED "pn532_start_passive_target_detection failed" RESET);
        return ESP_FAIL;
    }

    xSemaphoreTake(pn532_irq_semaphore, (TickType_t)0); // Clear the semaphore
    if (xSemaphoreTake(pn532_irq_semaphore, portMAX_DELAY) == pdTRUE) {
        return ESP_OK;
    }

    ESP_LOGI(TAG, RED "pn532_wait_for_card should not reach here" RESET);
    return ESP_FAIL; // Theoretically unreachable with portMAX_DELAY
}

/**
 * @brief Software trigger for the ISR.
 */
void trigger_isr(){
    xSemaphoreGive(pn532_irq_semaphore);
}
/*================================= Public Function Implementation =================================*/


/*================================= Private Function Implementation =================================*/
/**
 * @brief Interrupt Service Routine (ISR) for the PN532 IRQ pin.
 */
static void IRAM_ATTR _pn532_isr_handler(void* arg) {
    isr_counter++;
    BaseType_t xHigherPriorityTaskWoken = pdFALSE;
    xSemaphoreGiveFromISR(pn532_irq_semaphore, &xHigherPriorityTaskWoken);
    if (xHigherPriorityTaskWoken) {
        portYIELD_FROM_ISR();
    }
}

/**
 * @brief Configures the GPIO and ISR for the interrupt pin (IRQ).
 */
static esp_err_t _pn532_irq_init(void) {
    gpio_config_t io_conf = {
        .intr_type = GPIO_INTR_NEGEDGE,
        .pin_bit_mask = (1ULL << RFID_IRQ_PIN),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    esp_err_t err = gpio_config(&io_conf);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, RED "Failed to configure GPIO for IRQ!" RESET);
        return err;
    }

    err = gpio_install_isr_service(0);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_LOGE(TAG, RED "Failed to install ISR service!" RESET);
        return err;
    }
    
    err = gpio_isr_handler_add(RFID_IRQ_PIN, _pn532_isr_handler, NULL);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, RED "Failed to add ISR handler!" RESET);
        return err;
    }
    return ESP_OK;
}

static bool _write_full_command_frame(uint8_t *cmd, uint8_t cmdlen) {
    uint8_t frame_buffer[PN532_PACKBUFFSIZ];
    if (cmdlen > PN532_PACKBUFFSIZ - 9) {
        ESP_LOGE(TAG, RED "Command too long for _write_full_command_frame" RESET);
        return false;
    }

    uint8_t checksum;
    uint8_t frame_len = cmdlen + 1;
    int p = 0;

    frame_buffer[p++] = PN532_SPI_DATAWRITE;
    frame_buffer[p++] = PN532_PREAMBLE;
    frame_buffer[p++] = PN532_STARTCODE1;
    frame_buffer[p++] = PN532_STARTCODE2;
    checksum = PN532_PREAMBLE + PN532_STARTCODE1 + PN532_STARTCODE2;
    frame_buffer[p++] = frame_len;
    frame_buffer[p++] = ~frame_len + 1;
    frame_buffer[p++] = PN532_HOSTTOPN532;
    checksum += PN532_HOSTTOPN532;

    for (uint8_t i = 0; i < cmdlen; i++) {
        frame_buffer[p++] = cmd[i];
        checksum += cmd[i];
    }

    frame_buffer[p++] = ~checksum;
    frame_buffer[p++] = PN532_POSTAMBLE;

    /*==================================== DEBUG ====================================*/
    // char log_buffer[p * 3 + 1]; 
    // for (int i = 0; i < p; i++) {
    //     sprintf(&log_buffer[i * 3], "%02X ", frame_buffer[i]);
    // }
    // log_buffer[p * 3] = '\0'; 
    // ESP_LOGI(TAG, "sending Frame SPI [%d bytes]: %s", p, log_buffer);
    /*==================================== DEBUG ====================================*/

    return spi_transmit(SPI_DEVICE_RFID, frame_buffer, NULL, p * 8);
}

/**
 * @brief Reads a response frame from the PN532 via SPI.
 */
static bool _read_response_frame(uint8_t *buff, uint8_t n) {
    if (n > PN532_PACKBUFFSIZ) return false;

    uint8_t tx_buffer[n + 1];
    uint8_t rx_buffer[n + 1];
    memset(tx_buffer, 0, sizeof(tx_buffer));
    memset(rx_buffer, 0, sizeof(rx_buffer));
    tx_buffer[0] = PN532_SPI_DATAREAD;

    if (!spi_transmit(SPI_DEVICE_RFID, tx_buffer, rx_buffer, (n + 1) * 8)) {
        return false;
    }

    memcpy(buff, rx_buffer + 1, n);
    return true;
}

/**
 * @brief Reads and validates the ACK (Acknowledge) frame from the PN532.
 */
static bool _read_ack(void) {
    uint8_t ackbuff[6]; 
    const uint8_t pn532ack[] = {0x00, 0x00, 0xFF, 0x00, 0xFF, 0x00};
    
    if (!_read_response_frame(ackbuff, 6)) {
        return false;
    }
    
    return (0 == memcmp(ackbuff, pn532ack, 6));
}

/**
 * @brief Blocks execution until the IRQ signal is received or a timeout occurs.
 */
static bool _wait_for_irq(uint16_t timeout_ms) {
    if (pn532_irq_semaphore == NULL) return false;
    if (xSemaphoreTake(pn532_irq_semaphore, pdMS_TO_TICKS(timeout_ms)) == pdTRUE) {
        return true;
    }
    ESP_LOGW(TAG, RED "Timeout waiting for IRQ." RESET);
    return false;
}

/**
 * @brief Sends a command and waits for acknowledgment (ACK) via IRQ.
 */
static bool _send_command_wait_ack_irq(uint8_t *cmd, uint8_t cmdlen, uint16_t timeout) {
    xSemaphoreTake(pn532_irq_semaphore, (TickType_t)0);
    
    if (!_write_full_command_frame(cmd, cmdlen)) {
        ESP_LOGI(TAG, RED "_write_full_command_frame failed" RESET);
        return false;
    }

    if (!_wait_for_irq(timeout)) {
        return false;
    }
    
    return _read_ack();
}
/*================================= Private Function Implementation =================================*/
