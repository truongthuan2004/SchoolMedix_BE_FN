// vaccination.controller.js
import e from "express";
import { query } from "../config/database.js";


// Campaign
export async function createCampaign(req, res) {
      const { vaccine_id, description, location, start_date, end_date } = req.body;

      if (!vaccine_id || !description || !start_date || !end_date) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            // Check if vaccine exists
            const vaccines = await query("SELECT * FROM vaccine WHERE id = $1", [
                  vaccine_id,
            ]);
            if (vaccines.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Vaccine not found" });
            }

            // Check if campaign already exists for the same vaccine and date range
            //  ------------- cái này khỏi check cx đc, do hard code
            // const existingCampaigns = await query(
            //   `SELECT * FROM vaccination_campaign 
            //    WHERE vaccine_id = $1 
            //    AND start_date <= $2 
            //    AND end_date >= $3`,
            //   [vaccine_id, start_date, end_date]
            // );
            // if (existingCampaigns.rows.length > 0) {
            //   return res.status(409).json({
            //     error: true,
            //     message: "Campaign already exists",
            //   });
            // }

            // Insert campaign into database
            const insertQuery = `
        INSERT INTO vaccination_campaign (vaccine_id, description, location, start_date, end_date, status)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *;
    `;

            const result = await query(insertQuery, [
                  vaccine_id,
                  description,
                  location,
                  start_date,
                  end_date,
                  "PREPARING", // mndkhanh: sai flow, khi tạo ra campaign là PREPARING, (giai đoạn nhận đơn đăng ký)
            ]);
            return res
                  .status(201)
                  .json({ message: "Campaign created", data: result.rows[0] });
      } catch (error) {
            console.error("Error creating campaign:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

// get all campaigns to see
export async function getAllCampaigns(req, res) {
      try {
            const result = await query(`
      
            select a.id as campaign_id, b.id as vaccine_id, b.name as vaccine_name, a.description as description, location, start_date, end_date, status
            from vaccination_campaign a
            join vaccine b on a.vaccine_id = b.id
            ORDER BY a.start_date DESC;
            `);

            return res.status(200).json({
                  error: false,
                  message: "Lấy danh sách chiến dịch thành công",
                  data: result.rows
            });
      } catch (error) {
            console.error("Lỗi khi lấy danh sách chiến dịch:", error);
            return res.status(500).json({
                  error: true,
                  message: "Lỗi server khi lấy danh sách chiến dịch"
            });
      }
}


export async function getCampaignDetailByID(req, res) {
      const { campaign_id } = req.params;

      if (!campaign_id) {
            return res.status(400).json({
                  error: true,
                  message: "Thiếu campaign_id"
            });
      }

      try {
            const result = await query(
                  `
      SELECT 
        c.id, 
        c.name, 
        c.description, 
        c.start_date, 
        c.end_date, 
        c.created_at
      FROM campaign c
      WHERE c.id = $1
      LIMIT 1;
    `,
                  [campaign_id]
            );

            if (result.rows.length === 0) {
                  return res.status(404).json({
                        error: true,
                        message: "Không tìm thấy chiến dịch với ID này"
                  });
            }

            return res.status(200).json({
                  error: false,
                  message: "Lấy chi tiết chiến dịch thành công",
                  data: result.rows[0]
            });
      } catch (error) {
            console.error("Lỗi khi lấy chi tiết chiến dịch:", error);
            return res.status(500).json({
                  error: true,
                  message: "Lỗi server khi lấy chi tiết chiến dịch"
            });
      }
}

// Register
export async function createRegisterRequest(req, res) {
      const { campaign_id } = req.body;

      if (!campaign_id) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            // Check if campaign exists
            const campaigns = await query(
                  "SELECT * FROM vaccination_campaign WHERE id = $1",
                  [campaign_id]
            );
            if (campaigns.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Campaign not found" });
            }

            // Check if campaign is in progress
            const currentDate = new Date();
            const startDate = new Date(campaigns.rows[0].start_date);
            const endDate = new Date(campaigns.rows[0].end_date);
            console.log("Current Date:", currentDate);
            console.log("Start Date:", startDate);
            console.log("End Date:", endDate);
            if (currentDate < startDate || currentDate > endDate) {
                  return res
                        .status(400)
                        .json({ error: true, message: "Campaign is not in progress" });
            }

            // Check if registration already exists for the campaign
            const existingRegistrations = await query(
                  "SELECT * FROM vaccination_campaign_register WHERE campaign_id = $1",
                  [campaign_id]
            );
            if (existingRegistrations.rows.length > 0) {
                  return res.status(409).json({
                        error: true,
                        message: "Registration already exists for the campaign",
                  });
            }

            // Find vaccine from campaign
            const vaccine_id = campaigns.rows[0].vaccine_id;
            if (!vaccine_id) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Vaccine not found for campaign" });
            }

            // Find disease from vaccine
            const disease_id = await query(
                  "SELECT disease_id FROM vaccine WHERE id = $1",
                  [vaccine_id]
            );

            console.log("Disease ID:", disease_id.rows[0].disease_id);

            const disease = await query("SELECT * FROM disease WHERE id = $1", [
                  disease_id.rows[0].disease_id,
            ]);
            console.log("Disease:", disease.rows[0]);

            if (disease.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Disease not found for vaccine" });
            }

            //Get all students eligible for the campaign
            const studentsList = await query(
                  `
      SELECT s.id AS student_id,
        COUNT(vr.*) FILTER (WHERE vr.name = $1) AS dose_received
      FROM student s
      LEFT JOIN vaccination_record vr ON s.id = vr.student_id
      LEFT JOIN disease d ON vr.name = d.name
      GROUP BY s.id
    `,
                  [disease.rows[0].name]
            );
            console.log("Disease:", disease.rows[0].name);

            const eligibleStudents = studentsList.rows.filter(
                  (student) => student.dose_received < disease.rows[0].dose_quantity
            );
            if (eligibleStudents.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "No eligible students found" });
            }

            //Create registration requests for eligible students
            if (!eligibleStudents || eligibleStudents.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "No eligible students found" });
            }
            for (const student of eligibleStudents) {
                  await query(
                        `INSERT INTO vaccination_campaign_register (campaign_id, student_id, reason, is_registered)
         VALUES ($1, $2, $3, $4)`,
                        [campaign_id, student.student_id, `Auto_gen for ${campaign_id}`, false]
                  );
            }

            return res.status(201).json({
                  message: "Registration requests created for eligible students",
                  data: eligibleStudents,
            });
      } catch (error) {
            console.error("Error creating registration request:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

// Update is_registered to true for a student - parent consent for vaccination, only allow to update if the date is in the range of the campaign (Start-date, end-date)
export async function updateRegisterStatus(req, res) {
      const { id } = req.params;
      const { is_registered } = req.body;

      if (!is_registered || is_registered === undefined) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            // Check if registration exists
            const registration = await query(
                  "SELECT * FROM vaccination_campaign_register WHERE id = $1",
                  [id]
            );
            if (registration.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Registration not found" });
            }

            // Check if campaign is in progress
            const campaign = await query(
                  "SELECT * FROM vaccination_campaign WHERE id = $1",
                  [registration.rows[0].campaign_id]
            );
            if (campaign.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Campaign not found" });
            }

            const currentDate = new Date();
            const startDate = new Date(campaign.rows[0].start_date);
            const endDate = new Date(campaign.rows[0].end_date);

            if (currentDate < startDate || currentDate > endDate) {
                  console.log("Current Date:", currentDate);
                  console.log("Start Date:", startDate);
                  console.log("End Date:", endDate);
                  return res.status(400).json({
                        error: true,
                        message: "Cannot update registration status outside campaign dates",
                  });
            }

            // Update registration status
            await query(
                  "UPDATE vaccination_campaign_register SET is_registered = $1 WHERE id = $2",
                  [is_registered, id]
            );

            return res.status(200).json({
                  message: "Registration status updated successfully",
                  data: { id, is_registered },
            });
      } catch (error) {
            console.error("Error updating registration status:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

export async function getStudentEligibleForCampaign(req, res) {
      const { campaign_id } = req.params;
      if (!campaign_id) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            // Get all students eligible for the campaign
            const studentsList = await query(
            `
            SELECT s.id AS student_id,
            COUNT(vr.*) FILTER (WHERE vr.name = $1) AS dose_received
            FROM student s
            LEFT JOIN vaccination_record vr ON s.id = vr.student_id
            LEFT JOIN disease d ON vr.name = d.name
            GROUP BY s.id
            `,
                  [disease.rows[0].name]
            );

            const eligibleStudents = studentsList.rows.filter(
                  (student) => student.dose_received < disease.rows[0].dose_quantity
            );

            if (eligibleStudents.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "No eligible students found" });
            }

            return res.status(200).json({
                  message: "Eligible students retrieved",
                  data: eligibleStudents,
            });
      } catch (error) {
            console.error("Error retrieving eligible students:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

// Record
// Create pre-vaccination record for students who registered for the campaign
export async function createPreVaccinationRecord(req, res) {
      const { campaign_id } = req.params;

      try {
            // Check if campaign exists
            const campaigns = await query(
                  "SELECT * FROM vaccination_campaign WHERE id = $1",
                  [campaign_id]
            );
            if (campaigns.rows.length === 0) {
                  console.log("Campaign not found:", campaign_id);
                  return res
                        .status(404)
                        .json({ error: true, message: "Campaign not found" });
            }

            // Get name of the disease from the vaccine in the campaign
            const vaccine_id = campaigns.rows[0].vaccine_id;
            const disease_id = await query(
                  "SELECT disease_id FROM vaccine WHERE id = $1",
                  [vaccine_id]
            );
            const disease_name = await query("SELECT name FROM disease WHERE id = $1", [
                  disease_id.rows[0].disease_id,
            ]);

            // Get all students who registered for the campaign
            const registrations = await query(
                  "SELECT * FROM vaccination_campaign_register WHERE campaign_id = $1 AND is_registered = true",
                  [campaign_id]
            );

            if (registrations.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "No registered students found" });
            }

            // Create pre-vaccination records for each registered student
            for (const registration of registrations.rows) {
                  await query(
                        `INSERT INTO vaccination_record (student_id, campaign_id, name, status)
         VALUES ($1, $2, $3, 'pending')`,
                        [registration.student_id, campaign_id, disease_name.rows[0].name]
                  );
            }

            // Data to return
            // Fetch all vaccination records for the campaign
            const vaccinationRecords = await query(
                  "SELECT * FROM vaccination_record WHERE campaign_id = $1",
                  [campaign_id]
            );
            return res.status(201).json({
                  message: "Pre-vaccination records created for registered students",
                  data: vaccinationRecords,
            });
      } catch (error) {
            console.error("Error creating pre-vaccination record:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

export async function createVaccinationRecord(req, res) {
      const {
            student_id,
            register_id,
            description,
            name,
            location,
            vaccination_date,
            status,
            campaign_id,
      } = req.body;
      if (!student_id || !vaccination_date || !name || !status) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            // Check if student exists
            const students = await query("SELECT * FROM student WHERE id = $1", [
                  student_id,
            ]);
            if (students.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Student not found" });
            }

            // Insert vaccination record into database
            const insertQuery = `
        INSERT INTO vaccination_record (student_id, register_id, description, name, location, vaccination_date, status, campaign_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *;
    `;

            const result = await query(insertQuery, [
                  student_id,
                  register_id || null,
                  description || null,
                  name,
                  location || null,
                  vaccination_date,
                  status,
                  campaign_id || null,
            ]);

            return res
                  .status(201)
                  .json({ message: "Vaccination record created", data: result.rows[0] });
      } catch (error) {
            console.error("Error creating vaccination record:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

// Update vaccination record - keep old content if no new data is passed (null = no change)
export async function updateVaccinationRecord(req, res) {
      const { student_id } = req.params;
      const { description, name, location, vaccination_date, campaign_id } =
            req.body;

      try {
            // Check if vaccination record exists
            const record = await query(
                  "SELECT * FROM vaccination_record WHERE student_id = $1",
                  [student_id]
            );
            if (record.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Vaccination record not found" });
            }

            // Update vaccination record
            const updateQuery = `
            UPDATE vaccination_record
            SET description = COALESCE($1, description),
                  name = COALESCE($2, name),
                  location = COALESCE($3, location),
                  vaccination_date = COALESCE($4, vaccination_date),
                  campaign_id = COALESCE($5, campaign_id)
            WHERE id = $6
            RETURNING *;
      `;

            const result = await query(updateQuery, [
                  description,
                  name,
                  location,
                  vaccination_date,
                  campaign_id,
                  id,
            ]);

            return res.status(200).json({
                  message: "Vaccination record updated",
                  data: result.rows[0],
            });
      } catch (error) {
            console.error("Error updating vaccination record:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

// Get vaccination record by record ID
export async function getVaccinationRecord(req, res) {
      const { id } = req.params;

      if (!id) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            const records = await query(
                  "SELECT * FROM vaccination_record WHERE id = $1",
                  [id]
            );
            if (records.rows.length === 0) {
                  return res
                        .status(404)
                        .json({ error: true, message: "Vaccination record not found" });
            }

            return res.status(200).json({
                  message: "Vaccination record retrieved",
                  data: records.rows[0],
            });
      } catch (error) {
            console.error("Error retrieving vaccination record:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}

// Get all vaccination records for a student
export async function getVaccinationRecordsByStudentID(req, res) {
      const { student_id } = req.params;

      if (!student_id) {
            return res
                  .status(400)
                  .json({ error: true, message: "Missing required fields" });
      }

      try {
            const records = await query(
                  "SELECT * FROM vaccination_record WHERE student_id = $1",
                  [student_id]
            );
            if (records.rows.length === 0) {
                  return res.status(404).json({
                        error: true,
                        message: "No vaccination records found for this student",
                  });
            }

            return res.status(200).json({
                  message: "Vaccination records retrieved",
                  data: records.rows,
            });
      } catch (error) {
            console.error("Error retrieving vaccination records:", error);
            return res
                  .status(500)
                  .json({ error: true, message: "Internal server error" });
      }
}