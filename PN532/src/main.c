#include "spi.h"
#include "pn532.h"
#include "ansi_macro.h"
#include "esp_log.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = PURPLE "MAIN" RESET;

static void _rfid_task(void *pvParameters);

static bool led_state = false;

void app_main() {
    spi_bus_init();
    gpio_set_direction(GPIO_NUM_2, GPIO_MODE_OUTPUT);

    xTaskCreatePinnedToCore(
        _rfid_task,   // Task function
        "PN532 task", // Task name
        4096,                       // Stack size (in bytes)
        NULL,                       // Input parameter (can be NULL)
        5,                          // Task priority
        NULL,                       // Task handle (can be NULL)
        tskNO_AFFINITY              // Core where the task can run (no affinity)
    );
}


#define RECOVERY_DELAY_MS 1000
static void _rfid_task(void *pvParameter) {
    
    if (pn532_init() != ESP_OK) {
        vTaskDelete(NULL);
    }

    if (pn532_sam_config() != ESP_OK) {
        vTaskDelete(NULL);
    }

    if (pn532_set_power_mode() != ESP_OK) {
        vTaskDelete(NULL);
    }

    if (!pn532_get_firmware_version() == ESP_OK) {
        vTaskDelete(NULL);
    }

    ESP_LOGI(TAG, GREEN "PN532 driver ready. Starting detection loop." RESET);

    // Main application loop
    while (1) {
        // The pn532_wait_for_card() function now encapsulates IRQ arming and waiting.
        // The task blocks here efficiently until a card is detected.
        if (pn532_wait_for_card() == ESP_OK) {
            ESP_LOGI(TAG, GREEN "Interrupt received!" RESET);

            uint8_t uid[7];
            uint8_t uidLength;

            if (pn532_read_detected_passive_target(uid, &uidLength) == ESP_OK) {
                // --- Start of business logic ---
                char uid_str[uidLength * 2 + 1];
                for (int i = 0; i < uidLength; i++) {
                    sprintf(&uid_str[i * 2], "%02X", uid[i]);
                }
                uid_str[uidLength * 2] = '\0';

                ESP_LOGI(TAG, "Card detected. UID: %s", uid_str);

                if (strcmp(uid_str, "C5AC0907") == 0) {
                    led_state = !led_state;
                    gpio_set_level(GPIO_NUM_2, led_state);
                }

                // --- End of business logic ---

            } else {
                ESP_LOGW(TAG, "Interrupt received, but the subsequent card reading failed.");
            }

            // Pause to allow the card to be removed and avoid multiple reads.
            vTaskDelay(pdMS_TO_TICKS(500));

        } else {
            // This usually happens when a read occurs simultaneously with a WiFi connection.
            // If pn532_wait_for_card() fails, it means the arming command failed.
            ESP_LOGE(TAG, RED "Failed to arm the reader for detection. Trying to recover..." RESET);
            vTaskDelay(pdMS_TO_TICKS(RECOVERY_DELAY_MS));

            // If it fails more than N times, reconfigure the PN532.
            if (pn532_init() != ESP_OK){
                ESP_LOGI(TAG, RED "pn532_init failed" RESET);
            } else {
                ESP_LOGI(TAG, GREEN "pn532_init succeeded" RESET);
            }

            if (pn532_soft_reset() != ESP_OK){
                ESP_LOGI(TAG, RED "pn532_soft_reset failed" RESET);
            } else {
                ESP_LOGI(TAG, GREEN "pn532_soft_reset succeeded" RESET);
            }
            
            if (pn532_sam_config() != ESP_OK){
                ESP_LOGI(TAG, RED "pn532_sam_config failed" RESET);
            } else {
                ESP_LOGI(TAG, GREEN "pn532_sam_config succeeded" RESET);
            } 

            trigger_isr(); // Triggers the PN532 ISR via firmware to ensure no unread response remains
        }
    }
}